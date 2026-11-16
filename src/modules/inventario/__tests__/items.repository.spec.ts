import { UnprocessableEntityException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import { DatabaseModule } from '../../../common/database/database.module'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { EstadoOrden } from '../../ordenes/entities/orden.entity'
import { EstadoFisicoItem } from '../entities/item.entity'
import { ITEMS_REPOSITORY, ItemsRepository } from '../repositories/items.repository'

describe('ItemsRepository (Integration with test DB)', () => {
  let repository: ItemsRepository
  let db: Kysely<Database>
  let testOrdenId: number
  let testOrden2Id: number

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
          provide: ITEMS_REPOSITORY,
          useClass: ItemsRepository,
        },
      ],
    }).compile()

    repository = module.get<ItemsRepository>(ITEMS_REPOSITORY)
    db = module.get<Kysely<Database>>(KYSELY_DB)

    // Crear órdenes de prueba para asociar items
    const orden1 = await db
      .insertInto('ordenes')
      .values({
        cliente_nombre: 'Test Cliente 1',
        cliente_direccion: 'Calle Test 123',
        estado: EstadoOrden.PEDIDA,
        fecha_completada: null,
        repartidor_legajo: null,
        vehiculo_id: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testOrdenId = orden1.id

    const orden2 = await db
      .insertInto('ordenes')
      .values({
        cliente_nombre: 'Test Cliente 2',
        cliente_direccion: 'Calle Test 456',
        estado: EstadoOrden.PEDIDA,
        fecha_completada: null,
        repartidor_legajo: null,
        vehiculo_id: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testOrden2Id = orden2.id
  })

  afterAll(async () => {
    if (db) {
      await db.deleteFrom('items').execute()
      await db.deleteFrom('ordenes').where('id', 'in', [testOrdenId, testOrden2Id]).execute()
      await db.destroy()
    }
  })

  beforeEach(async () => {
    // Limpieza de items antes de cada test para aislamiento
    await db.deleteFrom('items').execute()
  })

  describe('crearItem', () => {
    it('crea un item con estado Disponible por defecto y ordenId en null', async () => {
      const item = await repository.crearItem({
        productoSku: 'PROD-001',
      })

      expect(item).toBeDefined()
      expect(item.id).toBeGreaterThan(0)
      expect(item.productoSku).toBe('PROD-001')
      expect(item.estadoFisico).toBe(EstadoFisicoItem.DISPONIBLE)
      expect(item.ordenId).toBeNull()

      // Verificar persistencia real en la DB
      const enDb = await db
        .selectFrom('items')
        .selectAll()
        .where('id', '=', item.id)
        .executeTakeFirstOrThrow()

      expect(enDb.producto_sku).toBe('PROD-001')
      expect(enDb.estado_fisico).toBe(EstadoFisicoItem.DISPONIBLE)
      expect(enDb.orden_id).toBeNull()
    })

    it('crea un item con estado físico y orden específica', async () => {
      const item = await repository.crearItem({
        productoSku: 'PROD-002',
        estadoFisico: EstadoFisicoItem.RESERVADO,
        ordenId: testOrdenId,
      })

      expect(item.productoSku).toBe('PROD-002')
      expect(item.estadoFisico).toBe(EstadoFisicoItem.RESERVADO)
      expect(item.ordenId).toBe(testOrdenId)

      const enDb = await db
        .selectFrom('items')
        .selectAll()
        .where('id', '=', item.id)
        .executeTakeFirstOrThrow()

      expect(enDb.estado_fisico).toBe(EstadoFisicoItem.RESERVADO)
      expect(enDb.orden_id).toBe(testOrdenId)
    })

    it('crea un item dentro de una transacción activa', async () => {
      const item = await db.transaction().execute(async (trx) => {
        return await repository.crearItem(
          {
            productoSku: 'PROD-003',
          },
          trx,
        )
      })

      expect(item.id).toBeGreaterThan(0)
      const enDb = await db
        .selectFrom('items')
        .selectAll()
        .where('id', '=', item.id)
        .executeTakeFirstOrThrow()

      expect(enDb.producto_sku).toBe('PROD-003')
    })
  })

  describe('countDisponibles', () => {
    it('retorna el conteo correcto filtrado por sku y estado Disponible', async () => {
      await db
        .insertInto('items')
        .values([
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrdenId,
          },
          { producto_sku: 'PROD-002', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
        ])
        .execute()

      const countProd1 = await repository.countDisponibles('PROD-001')
      const countProd2 = await repository.countDisponibles('PROD-002')
      const countProd3 = await repository.countDisponibles('PROD-003')

      expect(countProd1).toBe(2)
      expect(countProd2).toBe(1)
      expect(countProd3).toBe(0)
    })
  })

  describe('reservar', () => {
    it('actualiza estado_fisico a Reservado y asigna orden_id en los N primeros disponibles', async () => {
      await db
        .insertInto('items')
        .values([
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
        ])
        .execute()

      await db.transaction().execute(async (trx) => {
        await repository.reservar('PROD-001', 2, testOrdenId, trx)
      })

      const itemsReservados = await db
        .selectFrom('items')
        .selectAll()
        .where('producto_sku', '=', 'PROD-001')
        .where('estado_fisico', '=', EstadoFisicoItem.RESERVADO)
        .where('orden_id', '=', testOrdenId)
        .execute()

      const itemsDisponibles = await db
        .selectFrom('items')
        .selectAll()
        .where('producto_sku', '=', 'PROD-001')
        .where('estado_fisico', '=', EstadoFisicoItem.DISPONIBLE)
        .execute()

      expect(itemsReservados).toHaveLength(2)
      expect(itemsDisponibles).toHaveLength(1)
      expect(itemsDisponibles[0].orden_id).toBeNull()
    })

    it('lanza UnprocessableEntityException y no modifica datos si el stock disponible es insuficiente', async () => {
      await db
        .insertInto('items')
        .values([
          { producto_sku: 'PROD-001', estado_fisico: EstadoFisicoItem.DISPONIBLE, orden_id: null },
        ])
        .execute()

      await expect(
        db.transaction().execute(async (trx) => {
          await repository.reservar('PROD-001', 3, testOrdenId, trx)
        }),
      ).rejects.toThrow(UnprocessableEntityException)

      // Verificar que el item sigue disponible y no fue modificado
      const item = await db
        .selectFrom('items')
        .selectAll()
        .where('producto_sku', '=', 'PROD-001')
        .executeTakeFirstOrThrow()

      expect(item.estado_fisico).toBe(EstadoFisicoItem.DISPONIBLE)
      expect(item.orden_id).toBeNull()
    })
  })

  describe('prepararPorOrden', () => {
    it('actualiza todos los items Reservados de la orden a Preparado', async () => {
      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrdenId,
          },
          // Item de otra orden: no debe verse afectado
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrden2Id,
          },
        ])
        .execute()

      await db.transaction().execute(async (trx) => {
        await repository.prepararPorOrden(testOrdenId, trx)
      })

      const itemsOrden1 = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', testOrdenId)
        .execute()

      const itemsOrden2 = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', testOrden2Id)
        .execute()

      expect(itemsOrden1).toHaveLength(2)
      expect(itemsOrden1.every((i) => i.estado_fisico === EstadoFisicoItem.PREPARADO)).toBe(true)

      expect(itemsOrden2).toHaveLength(1)
      expect(itemsOrden2[0].estado_fisico).toBe(EstadoFisicoItem.RESERVADO)
    })
  })

  describe('entregarPorOrden', () => {
    it('actualiza todos los items Preparados de la orden a Entregado', async () => {
      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: testOrdenId,
          },
          // Item de otra orden: no debe verse afectado
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: testOrden2Id,
          },
        ])
        .execute()

      await db.transaction().execute(async (trx) => {
        await repository.entregarPorOrden(testOrdenId, trx)
      })

      const itemsOrden1 = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', testOrdenId)
        .execute()

      const itemsOrden2 = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', testOrden2Id)
        .execute()

      expect(itemsOrden1).toHaveLength(2)
      expect(itemsOrden1.every((i) => i.estado_fisico === EstadoFisicoItem.ENTREGADO)).toBe(true)

      expect(itemsOrden2).toHaveLength(1)
      expect(itemsOrden2[0].estado_fisico).toBe(EstadoFisicoItem.PREPARADO)
    })
  })

  describe('findByOrden', () => {
    it('retorna los items asignados a la orden mapeados a la entidad Item', async () => {
      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.ENTREGADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-003',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
        ])
        .execute()

      const result = await repository.findByOrden(testOrdenId)

      expect(result).toHaveLength(2)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            productoSku: 'PROD-001',
            estadoFisico: EstadoFisicoItem.PREPARADO,
            ordenId: testOrdenId,
          }),
          expect.objectContaining({
            productoSku: 'PROD-002',
            estadoFisico: EstadoFisicoItem.ENTREGADO,
            ordenId: testOrdenId,
          }),
        ]),
      )
    })

    it('retorna array vacío si la orden no tiene items asignados', async () => {
      const result = await repository.findByOrden(999999)
      expect(result).toEqual([])
    })
  })

  describe('obtenerEstadoItems', () => {
    it('retorna lista vacía cuando no hay items en el warehouse', async () => {
      const result = await repository.obtenerEstadoItems()
      expect(result.data).toEqual([])
      expect(result.offset).toBe(0)
      expect(result.pageSize).toBe(10)
      expect(result.hasNextPage).toBe(false)
    })

    it('retorna lista agrupada con disponibles y reservados por SKU', async () => {
      await db
        .insertInto('items')
        .values([
          // PROD-001: 2 disponibles, 1 reservado, 1 preparado
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.PREPARADO,
            orden_id: testOrdenId,
          },
          // PROD-002: 1 disponible, 0 reservados
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          // PROD-003: 0 disponibles, 2 reservados
          {
            producto_sku: 'PROD-003',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrdenId,
          },
          {
            producto_sku: 'PROD-003',
            estado_fisico: EstadoFisicoItem.RESERVADO,
            orden_id: testOrden2Id,
          },
        ])
        .execute()

      const result = await repository.obtenerEstadoItems()

      expect(result.data).toEqual([
        {
          sku: 'PROD-001',
          disponibles: 2,
          reservados: 1,
        },
        {
          sku: 'PROD-002',
          disponibles: 1,
          reservados: 0,
        },
        {
          sku: 'PROD-003',
          disponibles: 0,
          reservados: 2,
        },
      ])
      expect(result.offset).toBe(0)
      expect(result.pageSize).toBe(10)
      expect(result.hasNextPage).toBe(false)
    })

    it('retorna resultados paginados usando pageSize y offset, con hasNextPage', async () => {
      await db
        .insertInto('items')
        .values([
          {
            producto_sku: 'PROD-001',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          {
            producto_sku: 'PROD-002',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
          {
            producto_sku: 'PROD-003',
            estado_fisico: EstadoFisicoItem.DISPONIBLE,
            orden_id: null,
          },
        ])
        .execute()

      const primeraPagina = await repository.obtenerEstadoItems({ pageSize: 2, offset: 0 })
      expect(primeraPagina.data).toHaveLength(2)
      expect(primeraPagina.offset).toBe(0)
      expect(primeraPagina.pageSize).toBe(2)
      expect(primeraPagina.hasNextPage).toBe(true)
      expect(primeraPagina.data[0].sku).toBe('PROD-001')
      expect(primeraPagina.data[1].sku).toBe('PROD-002')

      const segundaPagina = await repository.obtenerEstadoItems({ pageSize: 2, offset: 2 })
      expect(segundaPagina.data).toHaveLength(1)
      expect(segundaPagina.offset).toBe(2)
      expect(segundaPagina.pageSize).toBe(2)
      expect(segundaPagina.hasNextPage).toBe(false)
      expect(segundaPagina.data[0].sku).toBe('PROD-003')
    })
  })
})
