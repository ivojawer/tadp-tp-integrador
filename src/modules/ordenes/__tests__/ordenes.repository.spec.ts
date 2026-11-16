import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import { DatabaseModule } from '../../../common/database/database.module'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { EstadoFisicoItem } from '../../inventario/entities/item.entity'
import { EstadoOrden } from '../entities/orden.entity'
import { ORDENES_REPOSITORY, OrdenesRepository } from '../repositories/ordenes.repository'

describe('OrdenesRepository (Integration with test DB)', () => {
  let repository: OrdenesRepository
  let db: Kysely<Database>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.development', '.env'],
        }),
        DatabaseModule,
      ],
      providers: [
        {
          provide: ORDENES_REPOSITORY,
          useClass: OrdenesRepository,
        },
      ],
    }).compile()

    repository = module.get<OrdenesRepository>(ORDENES_REPOSITORY)
    db = module.get<Kysely<Database>>(KYSELY_DB)

    // Asegurar que los productos de prueba existen en la DB
    await db
      .insertInto('productos')
      .values([
        {
          sku: 'PROD-001',
          nombre: 'Producto 1',
          descripcion: 'Desc 1',
          marca: 'Marca 1',
        },
        {
          sku: 'PROD-002',
          nombre: 'Producto 2',
          descripcion: 'Desc 2',
          marca: 'Marca 2',
        },
      ])
      .onConflict((oc) => oc.column('sku').doNothing())
      .execute()
  })

  afterAll(async () => {
    if (db) {
      await db.deleteFrom('items').execute()
      await db.deleteFrom('items_pedidos').execute()
      await db.deleteFrom('ordenes').execute()
      await db.destroy()
    }
  })

  beforeEach(async () => {
    // Limpieza de tablas afectadas antes de cada test para aislamiento total
    await db.deleteFrom('items').execute()
    await db.deleteFrom('items_pedidos').execute()
    await db.deleteFrom('ordenes').execute()
  })

  describe('findById', () => {
    it('retorna null si la orden no existe', async () => {
      const result = await repository.findById(999999)
      expect(result).toBeNull()
    })

    it('retorna Orden con itemsPedidos correctamente mapeados', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Carlos Gómez',
          cliente_direccion: 'San Martín 123',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('items_pedidos')
        .values([
          {
            orden_id: orden.id,
            producto_sku: 'PROD-001',
            cantidad: 3,
          },
          {
            orden_id: orden.id,
            producto_sku: 'PROD-002',
            cantidad: 1,
          },
        ])
        .execute()

      const result = await repository.findById(orden.id)

      expect(result).toBeDefined()
      expect(result!.id).toBe(orden.id)
      expect(result!.clienteNombre).toBe('Carlos Gómez')
      expect(result!.clienteDireccion).toBe('San Martín 123')
      expect(result!.estado).toBe(EstadoOrden.PEDIDA)
      expect(result!.itemsPedidos).toHaveLength(2)

      const item1 = result!.itemsPedidos.find((i) => i.productoSku === 'PROD-001')
      const item2 = result!.itemsPedidos.find((i) => i.productoSku === 'PROD-002')

      expect(item1).toBeDefined()
      expect(item1!.cantidad).toBe(3)
      expect(item1!.items).toEqual([])

      expect(item2).toBeDefined()
      expect(item2!.cantidad).toBe(1)
      expect(item2!.items).toEqual([])
    })

    it('retorna Orden con itemsPedidos e items físicos asignados con su estadoFisico', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Lucía Fernández',
          cliente_direccion: 'Mitre 555',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      // Otra orden para verificar que no se mezclan items
      const otraOrden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Otro Cliente',
          cliente_direccion: 'Otra Calle 999',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      await db
        .insertInto('items_pedidos')
        .values([
          {
            orden_id: orden.id,
            producto_sku: 'PROD-001',
            cantidad: 2,
          },
          {
            orden_id: orden.id,
            producto_sku: 'PROD-002',
            cantidad: 1,
          },
        ])
        .execute()

      // Insertar items físicos asignados y no asignados
      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: orden.id,
          },
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: orden.id,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: orden.id,
          },
          // Item disponible en warehouse (no asignado)
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          // Item de otra orden
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: otraOrden.id,
          },
        ])
        .execute()

      const result = await repository.findById(orden.id)

      expect(result).toBeDefined()
      expect(result!.itemsPedidos).toHaveLength(2)

      const item1 = result!.itemsPedidos.find((i) => i.productoSku === 'PROD-001')
      expect(item1).toBeDefined()
      expect(item1!.cantidad).toBe(2)
      expect(item1!.items).toHaveLength(2)
      expect(item1!.items.every((it) => it.estadoFisico === EstadoFisicoItem.RESERVADO)).toBe(true)
      expect(item1!.items.every((it) => it.ordenId === orden.id)).toBe(true)

      const item2 = result!.itemsPedidos.find((i) => i.productoSku === 'PROD-002')
      expect(item2).toBeDefined()
      expect(item2!.cantidad).toBe(1)
      expect(item2!.items).toHaveLength(1)
      expect(item2!.items[0].estadoFisico).toBe(EstadoFisicoItem.PREPARADO)
      expect(item2!.items[0].ordenId).toBe(orden.id)
    })
  })

  describe('create', () => {
    it('crea una orden con itemsPedidos populated y lista de items físicos vacía', async () => {
      const result = await repository.create({
        clienteNombre: 'Ana Torres',
        clienteDireccion: 'Rivadavia 789',
        items: [
          { productoSku: 'PROD-001', cantidad: 2 },
          { productoSku: 'PROD-002', cantidad: 1 },
        ],
      })

      expect(result).toBeDefined()
      expect(result.id).toBeGreaterThan(0)
      expect(result.clienteNombre).toBe('Ana Torres')
      expect(result.clienteDireccion).toBe('Rivadavia 789')
      expect(result.estado).toBe(EstadoOrden.PEDIDA)
      expect(result.itemsPedidos).toHaveLength(2)

      const item1 = result.itemsPedidos.find((i) => i.productoSku === 'PROD-001')
      expect(item1).toBeDefined()
      expect(item1!.id).toBeGreaterThan(0)
      expect(item1!.cantidad).toBe(2)
      expect(item1!.items).toEqual([])

      const item2 = result.itemsPedidos.find((i) => i.productoSku === 'PROD-002')
      expect(item2).toBeDefined()
      expect(item2!.id).toBeGreaterThan(0)
      expect(item2!.cantidad).toBe(1)
      expect(item2!.items).toEqual([])

      // Verificar persistencia real en la base de datos
      const enDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', result.id)
        .executeTakeFirstOrThrow()
      expect(enDb.cliente_nombre).toBe('Ana Torres')

      const itemsPedidosEnDb = await db
        .selectFrom('items_pedidos')
        .selectAll()
        .where('orden_id', '=', result.id)
        .execute()
      expect(itemsPedidosEnDb).toHaveLength(2)
    })
  })

  describe('updateEstado', () => {
    it('actualiza el estado de la orden y retorna la entidad con itemsPedidos', async () => {
      const orden = await repository.create({
        clienteNombre: 'Marcos Juárez',
        clienteDireccion: 'Belgrano 100',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })

      const actualizada = await repository.updateEstado(orden.id, EstadoOrden.LISTA)

      expect(actualizada.id).toBe(orden.id)
      expect(actualizada.estado).toBe(EstadoOrden.LISTA)
      expect(actualizada.itemsPedidos).toHaveLength(1)
      expect(actualizada.itemsPedidos[0].productoSku).toBe('PROD-001')

      // Verificar persistencia real
      const enDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirstOrThrow()
      expect(enDb.estado).toBe(EstadoOrden.LISTA)
    })

    it('ejecuta el callback onTransaction dentro de la misma transacción y persiste los cambios', async () => {
      const orden = await repository.create({
        clienteNombre: 'Sofía Martínez',
        clienteDireccion: 'Av. Corrientes 1000',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })

      await db
        .insertInto('items')
        .values({
          producto_sku: 'PROD-001',
          estado_fisico: EstadoFisicoItem.RESERVADO,
          orden_id: orden.id,
        })
        .execute()

      const actualizada = await repository.updateEstado(
        orden.id,
        EstadoOrden.LISTA,
        undefined,
        async (ordenId, trx) => {
          await trx
            .updateTable('items')
            .set({ estado_fisico: EstadoFisicoItem.PREPARADO })
            .where('orden_id', '=', ordenId)
            .execute()
        },
      )

      expect(actualizada.estado).toBe(EstadoOrden.LISTA)
      expect(actualizada.itemsPedidos[0].items[0].estadoFisico).toBe(EstadoFisicoItem.PREPARADO)

      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirstOrThrow()
      expect(ordenEnDb.estado).toBe(EstadoOrden.LISTA)

      const itemEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', orden.id)
        .executeTakeFirstOrThrow()
      expect(itemEnDb.estado_fisico).toBe(EstadoFisicoItem.PREPARADO)
    })

    it('realiza rollback total si el callback onTransaction falla', async () => {
      const orden = await repository.create({
        clienteNombre: 'Martín Palermo',
        clienteDireccion: 'Brandsen 805',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })

      await db
        .insertInto('items')
        .values({
          producto_sku: 'PROD-001',
          estado_fisico: EstadoFisicoItem.RESERVADO,
          orden_id: orden.id,
        })
        .execute()

      await expect(
        repository.updateEstado(orden.id, EstadoOrden.LISTA, undefined, async (ordenId, trx) => {
          await trx
            .updateTable('items')
            .set({ estado_fisico: EstadoFisicoItem.PREPARADO })
            .where('orden_id', '=', ordenId)
            .execute()
          throw new Error('Fallo intencional para verificar rollback')
        }),
      ).rejects.toThrow('Fallo intencional para verificar rollback')

      // Verificar que el estado de la orden no cambió (sigue en Pedida)
      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirstOrThrow()
      expect(ordenEnDb.estado).toBe(EstadoOrden.PEDIDA)

      // Verificar que el item físico no cambió (sigue en Reservado)
      const itemEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', orden.id)
        .executeTakeFirstOrThrow()
      expect(itemEnDb.estado_fisico).toBe(EstadoFisicoItem.RESERVADO)
    })
  })

  describe('findAll', () => {
    it('sin filtro retorna todas las órdenes con sus itemsPedidos e items físicos', async () => {
      const o1 = await repository.create({
        clienteNombre: 'Cliente Uno',
        clienteDireccion: 'Direccion 1',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })
      const o2 = await repository.create({
        clienteNombre: 'Cliente Dos',
        clienteDireccion: 'Direccion 2',
        items: [{ productoSku: 'PROD-002', cantidad: 2 }],
      })

      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: o1.id,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: o2.id,
          },
        ])
        .execute()

      const result = await repository.findAll()

      expect(result.data).toHaveLength(2)
      expect(result.offset).toBe(0)
      expect(result.pageSize).toBe(10)
      expect(result.hasNextPage).toBe(false)
      expect(result.data[0].id).toBe(o1.id)
      expect(result.data[0].clienteNombre).toBe('Cliente Uno')
      expect(result.data[0].itemsPedidos).toHaveLength(1)
      expect(result.data[0].itemsPedidos[0].items).toHaveLength(1)
      expect(result.data[0].itemsPedidos[0].items[0].productoSku).toBe('PROD-001')

      expect(result.data[1].id).toBe(o2.id)
      expect(result.data[1].clienteNombre).toBe('Cliente Dos')
      expect(result.data[1].itemsPedidos).toHaveLength(1)
      expect(result.data[1].itemsPedidos[0].items).toHaveLength(1)
      expect(result.data[1].itemsPedidos[0].items[0].productoSku).toBe('PROD-002')
    })

    it('con estado retorna únicamente las órdenes en dicho estado (WHERE estado = X)', async () => {
      const o1 = await repository.create({
        clienteNombre: 'Cliente Pedida',
        clienteDireccion: 'Direccion 1',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })
      const o2 = await repository.create({
        clienteNombre: 'Cliente Lista',
        clienteDireccion: 'Direccion 2',
        items: [{ productoSku: 'PROD-002', cantidad: 1 }],
      })

      await repository.updateEstado(o2.id, EstadoOrden.LISTA)

      const ordenesPedidas = await repository.findAll({ estado: EstadoOrden.PEDIDA })
      expect(ordenesPedidas.data).toHaveLength(1)
      expect(ordenesPedidas.data[0].id).toBe(o1.id)
      expect(ordenesPedidas.data[0].estado).toBe(EstadoOrden.PEDIDA)
      expect(ordenesPedidas.hasNextPage).toBe(false)

      const ordenesListas = await repository.findAll({ estado: EstadoOrden.LISTA })
      expect(ordenesListas.data).toHaveLength(1)
      expect(ordenesListas.data[0].id).toBe(o2.id)
      expect(ordenesListas.data[0].estado).toBe(EstadoOrden.LISTA)
      expect(ordenesListas.hasNextPage).toBe(false)
    })

    it('retorna resultados paginados usando pageSize y offset, calculando hasNextPage', async () => {
      const o1 = await repository.create({
        clienteNombre: 'Cliente 1',
        clienteDireccion: 'Direccion 1',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })
      const o2 = await repository.create({
        clienteNombre: 'Cliente 2',
        clienteDireccion: 'Direccion 2',
        items: [{ productoSku: 'PROD-002', cantidad: 1 }],
      })
      const o3 = await repository.create({
        clienteNombre: 'Cliente 3',
        clienteDireccion: 'Direccion 3',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })

      const primeraPagina = await repository.findAll({ pageSize: 2, offset: 0 })
      expect(primeraPagina.data).toHaveLength(2)
      expect(primeraPagina.offset).toBe(0)
      expect(primeraPagina.pageSize).toBe(2)
      expect(primeraPagina.hasNextPage).toBe(true)
      expect(primeraPagina.data[0].id).toBe(o1.id)
      expect(primeraPagina.data[1].id).toBe(o2.id)

      const segundaPagina = await repository.findAll({ pageSize: 2, offset: 2 })
      expect(segundaPagina.data).toHaveLength(1)
      expect(segundaPagina.offset).toBe(2)
      expect(segundaPagina.pageSize).toBe(2)
      expect(segundaPagina.hasNextPage).toBe(false)
      expect(segundaPagina.data[0].id).toBe(o3.id)
    })

    it('retorna data vacía cuando no hay órdenes que coincidan', async () => {
      await repository.create({
        clienteNombre: 'Cliente Pedida',
        clienteDireccion: 'Direccion 1',
        items: [{ productoSku: 'PROD-001', cantidad: 1 }],
      })

      const ordenes = await repository.findAll({ estado: EstadoOrden.COMPLETADA })
      expect(ordenes.data).toEqual([])
      expect(ordenes.hasNextPage).toBe(false)
    })

    it('retorna data vacía si la base de datos no tiene órdenes', async () => {
      const ordenes = await repository.findAll()
      expect(ordenes.data).toEqual([])
      expect(ordenes.hasNextPage).toBe(false)
    })
  })
})
