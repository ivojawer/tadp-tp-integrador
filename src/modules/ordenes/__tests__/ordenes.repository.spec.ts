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
  })
})
