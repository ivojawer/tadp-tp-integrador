import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { KYSELY_DB } from '../src/common/database/database.provider'
import { Database } from '../src/common/database/types'
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter'
import { EstadoFisicoItem } from '../src/modules/inventario/entities/item.entity'
import { CreateOrdenDto } from '../src/modules/ordenes/dto/create-orden.dto'
import { UpdateEstadoOrdenDto } from '../src/modules/ordenes/dto/update-estado-orden.dto'
import { EstadoOrden } from '../src/modules/ordenes/entities/orden.entity'

describe('Ordenes (e2e)', () => {
  let app: INestApplication
  let db: Kysely<Database>

  const cleanTables = async (): Promise<void> => {
    await db.deleteFrom('items').execute()
    await db.deleteFrom('items_pedidos').execute()
    await db.deleteFrom('ordenes').execute()
  }

  const insertItemsDisponibles = async (productoSku: string, cantidad: number): Promise<void> => {
    const rows = Array.from({ length: cantidad }, () => ({
      producto_sku: productoSku,
      estado_fisico: EstadoFisicoItem.DISPONIBLE,
      orden_id: null,
    }))
    await db.insertInto('items').values(rows).execute()
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    )

    app.useGlobalFilters(new AllExceptionsFilter())

    await app.init()

    db = moduleFixture.get<Kysely<Database>>(KYSELY_DB)

    // Asegurar semillas base para testing (productos, repartidor, vehículo)
    await db
      .insertInto('productos')
      .values([
        {
          sku: 'PROD-001',
          nombre: 'Caja de Herramientas 50 piezas',
          descripcion: 'Set completo de llaves y destornilladores',
          marca: 'Stanley',
        },
        {
          sku: 'PROD-002',
          nombre: 'Taladro Percutor Inalámbrico',
          descripcion: 'Taladro 18V con dos baterías',
          marca: 'Bosch',
        },
        {
          sku: 'PROD-003',
          nombre: 'Amoladora Angular 820W',
          descripcion: 'Amoladora para corte y desbaste',
          marca: 'DeWalt',
        },
      ])
      .onConflict((oc) => oc.column('sku').doNothing())
      .execute()

    await db
      .insertInto('usuarios')
      .values({
        legajo: 'REP-101',
        nombre: 'Juan Pérez',
        email: 'juan.perez@logistica.local',
        password: 'password123',
      })
      .onConflict((oc) => oc.column('legajo').doNothing())
      .execute()

    await db
      .insertInto('vehiculos')
      .values({
        id: 1,
        modelo: 'Renault Kangoo',
        capacidad_volumen: 3.0,
        capacidad_peso: 650.0,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
  })

  afterAll(async () => {
    if (db) {
      await cleanTables()
      await db.destroy()
    }
    if (app) {
      await app.close()
    }
  })

  beforeEach(async () => {
    await cleanTables()
  })

  describe('Creación de orden (POST /ordenes)', () => {
    it('debe crear una orden con stock disponible, reservar los items físicos y retornar 201 Created', async () => {
      // Stock inicial disponible en warehouse
      await insertItemsDisponibles('PROD-001', 2)
      await insertItemsDisponibles('PROD-002', 1)

      const payload: CreateOrdenDto = {
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Av. Corrientes 1234, CABA',
        items: [
          { productoSku: 'PROD-001', cantidad: 2 },
          { productoSku: 'PROD-002', cantidad: 1 },
        ],
      }

      const response = await request(app.getHttpServer()).post('/ordenes').send(payload).expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        clienteNombre: payload.clienteNombre,
        clienteDireccion: payload.clienteDireccion,
        estado: EstadoOrden.PEDIDA,
        fechaCompletada: null,
        repartidorLegajo: null,
        vehiculoId: null,
        itemsPedidos: expect.arrayContaining([
          expect.objectContaining({ productoSku: 'PROD-001', cantidad: 2 }),
          expect.objectContaining({ productoSku: 'PROD-002', cantidad: 1 }),
        ]),
      })

      const ordenId = response.body.id

      // Verificación directa en PostgreSQL: orden persistida
      const ordenGuardada = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', ordenId)
        .executeTakeFirst()

      expect(ordenGuardada).toBeDefined()
      expect(ordenGuardada?.cliente_nombre).toBe('Juan Pérez')
      expect(ordenGuardada?.estado).toBe(EstadoOrden.PEDIDA)

      // Verificación directa en PostgreSQL: items pedidos creados
      const itemsPedidosGuardados = await db
        .selectFrom('items_pedidos')
        .selectAll()
        .where('orden_id', '=', ordenId)
        .execute()

      expect(itemsPedidosGuardados).toHaveLength(2)

      // Verificación directa en PostgreSQL: items físicos asignados y en estado Reservado
      const itemsFisicosEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', ordenId)
        .execute()

      expect(itemsFisicosEnDb).toHaveLength(3)
      expect(itemsFisicosEnDb.every((i) => i.estado_fisico === EstadoFisicoItem.RESERVADO)).toBe(
        true,
      )

      // Verificación a través de GET /ordenes/:id
      const getResponse = await request(app.getHttpServer()).get(`/ordenes/${ordenId}`).expect(200)

      expect(getResponse.body.itemsPedidos).toHaveLength(2)
      for (const ip of getResponse.body.itemsPedidos) {
        expect(ip.items).toHaveLength(ip.cantidad)
        expect(ip.items.every((it: any) => it.estadoFisico === EstadoFisicoItem.RESERVADO)).toBe(
          true,
        )
      }
    })

    it('debe retornar 409 Conflict con el SKU faltante si no hay stock suficiente y no crear la orden', async () => {
      // Solo 1 disponible pero se requieren 2
      await insertItemsDisponibles('PROD-001', 1)

      const payload: CreateOrdenDto = {
        clienteNombre: 'Carlos Gómez',
        clienteDireccion: 'Belgrano 500',
        items: [{ productoSku: 'PROD-001', cantidad: 2 }],
      }

      const response = await request(app.getHttpServer()).post('/ordenes').send(payload).expect(409)

      expect(response.body.error.message).toContain('PROD-001')

      // Verificar que no se creó ninguna orden ni se modificó el item disponible
      const ordenesCount = await db.selectFrom('ordenes').selectAll().execute()
      expect(ordenesCount).toHaveLength(0)

      const itemDisponible = await db.selectFrom('items').selectAll().executeTakeFirst()
      expect(itemDisponible?.estado_fisico).toBe(EstadoFisicoItem.DISPONIBLE)
      expect(itemDisponible?.orden_id).toBeNull()
    })

    it('debe retornar 400 Bad Request si la lista de items está vacía', async () => {
      const payloadSinItems = {
        clienteNombre: 'María López',
        clienteDireccion: 'Av. Santa Fe 2000',
        items: [],
      }

      const response = await request(app.getHttpServer())
        .post('/ordenes')
        .send(payloadSinItems)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe retornar 400 Bad Request si faltan campos obligatorios', async () => {
      const payloadIncompleto = {
        clienteNombre: '',
        clienteDireccion: 'Calle Falsa 123',
      }

      const response = await request(app.getHttpServer())
        .post('/ordenes')
        .send(payloadIncompleto)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })
  })

  describe('Consulta de orden (GET /ordenes/:id y GET /ordenes)', () => {
    it('GET /ordenes/:id existente debe retornar 200 OK con itemsPedidos e items físicos asignados', async () => {
      // Setup directo en DB
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Carlos Gómez',
          cliente_direccion: 'Brandsen 805',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const itemPedido = await db
        .insertInto('items_pedidos')
        .values({
          orden_id: orden.id,
          producto_sku: 'PROD-001',
          cantidad: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const itemFisico = await db
        .insertInto('items')
        .values({
          producto_sku: 'PROD-001',
          estado_fisico: EstadoFisicoItem.RESERVADO,
          orden_id: orden.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const response = await request(app.getHttpServer()).get(`/ordenes/${orden.id}`).expect(200)

      expect(response.body).toEqual({
        id: orden.id,
        clienteNombre: 'Carlos Gómez',
        clienteDireccion: 'Brandsen 805',
        estado: EstadoOrden.PEDIDA,
        fechaCompletada: null,
        repartidorLegajo: null,
        vehiculoId: null,
        itemsPedidos: [
          {
            id: itemPedido.id,
            productoSku: 'PROD-001',
            cantidad: 1,
            items: [
              {
                id: itemFisico.id,
                productoSku: 'PROD-001',
                estadoFisico: EstadoFisicoItem.RESERVADO,
                ordenId: orden.id,
              },
            ],
          },
        ],
      })
    })

    it('GET /ordenes/:id inexistente debe retornar 404 Not Found', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/999999').expect(404)

      expect(response.body.statusCode).toBe(404)
    })

    it('GET /ordenes/:id con ID inválido debe retornar 400 Bad Request', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/id-no-valido').expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('GET /ordenes debe retornar 200 OK con el array de todas las órdenes', async () => {
      // Inserción de 2 órdenes
      const orden1 = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Cliente 1',
          cliente_direccion: 'Dirección 1',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const orden2 = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Cliente 2',
          cliente_direccion: 'Dirección 2',
          estado: EstadoOrden.LISTA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const response = await request(app.getHttpServer()).get('/ordenes').expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.offset).toBe(0)
      expect(response.body.pageSize).toBe(10)
      expect(response.body.hasNextPage).toBeDefined()
      expect(response.body.data.length).toBeGreaterThanOrEqual(2)
      const ids = response.body.data.map((o: any) => o.id)
      expect(ids).toContain(orden1.id)
      expect(ids).toContain(orden2.id)
    })

    it('GET /ordenes?estado=Pedida debe filtrar y retornar solo órdenes en ese estado', async () => {
      await db
        .insertInto('ordenes')
        .values([
          {
            cliente_nombre: 'Orden Pedida 1',
            cliente_direccion: 'Dirección A',
            estado: EstadoOrden.PEDIDA,
            fecha_completada: null,
            repartidor_legajo: null,
            vehiculo_id: null,
          },
          {
            cliente_nombre: 'Orden Lista 1',
            cliente_direccion: 'Dirección B',
            estado: EstadoOrden.LISTA,
            fecha_completada: null,
            repartidor_legajo: null,
            vehiculo_id: null,
          },
        ])
        .execute()

      const response = await request(app.getHttpServer())
        .get('/ordenes')
        .query({ estado: EstadoOrden.PEDIDA })
        .expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.offset).toBe(0)
      expect(response.body.pageSize).toBe(10)
      expect(response.body.hasNextPage).toBeDefined()
      expect(response.body.data.length).toBeGreaterThan(0)
      expect(response.body.data.every((o: any) => o.estado === EstadoOrden.PEDIDA)).toBe(true)
    })

    it('GET /ordenes con paginación (pageSize y offset) debe limitar, desplazar y calcular hasNextPage', async () => {
      await db
        .insertInto('ordenes')
        .values([
          {
            cliente_nombre: 'Orden Paginada 1',
            cliente_direccion: 'Dirección P1',
            estado: EstadoOrden.PEDIDA,
            fecha_completada: null,
            repartidor_legajo: null,
            vehiculo_id: null,
          },
          {
            cliente_nombre: 'Orden Paginada 2',
            cliente_direccion: 'Dirección P2',
            estado: EstadoOrden.PEDIDA,
            fecha_completada: null,
            repartidor_legajo: null,
            vehiculo_id: null,
          },
          {
            cliente_nombre: 'Orden Paginada 3',
            cliente_direccion: 'Dirección P3',
            estado: EstadoOrden.PEDIDA,
            fecha_completada: null,
            repartidor_legajo: null,
            vehiculo_id: null,
          },
        ])
        .execute()

      const response = await request(app.getHttpServer())
        .get('/ordenes')
        .query({ pageSize: 2, offset: 0 })
        .expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.data.length).toBe(2)
      expect(response.body.offset).toBe(0)
      expect(response.body.pageSize).toBe(2)
      expect(response.body.hasNextPage).toBe(true)
    })

    it('GET /ordenes con pageSize inválido debe retornar 400 Bad Request', async () => {
      await request(app.getHttpServer()).get('/ordenes').query({ pageSize: 0 }).expect(400)
    })

    it('GET /items con paginación (pageSize y offset) debe paginar el listado de items por SKU con metadatos', async () => {
      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ pageSize: 1, offset: 0 })
        .expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.data.length).toBeLessThanOrEqual(1)
      expect(response.body.offset).toBe(0)
      expect(response.body.pageSize).toBe(1)
      expect(typeof response.body.hasNextPage).toBe('boolean')
    })

    it('GET /items con offset inválido debe retornar 400 Bad Request', async () => {
      await request(app.getHttpServer()).get('/items').query({ offset: -1 }).expect(400)
    })
  })

  describe('Transiciones de estado (PATCH /ordenes/:id/estado)', () => {
    it('Pedida -> Lista: debe actualizar estado a Lista y los items físicos a Preparado (200 OK)', async () => {
      await insertItemsDisponibles('PROD-001', 2)

      const createResponse = await request(app.getHttpServer())
        .post('/ordenes')
        .send({
          clienteNombre: 'Ana Frank',
          clienteDireccion: 'Amsterdam 100',
          items: [{ productoSku: 'PROD-001', cantidad: 2 }],
        })
        .expect(201)

      const ordenId = createResponse.body.id

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.LISTA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${ordenId}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.LISTA)

      // Verificación en PostgreSQL: estado de la orden
      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', ordenId)
        .executeTakeFirst()

      expect(ordenEnDb?.estado).toBe(EstadoOrden.LISTA)

      // Verificación en PostgreSQL: items físicos pasaron a Preparado
      const itemsEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', ordenId)
        .execute()

      expect(itemsEnDb).toHaveLength(2)
      expect(itemsEnDb.every((i) => i.estado_fisico === EstadoFisicoItem.PREPARADO)).toBe(true)

      // Verificación de itemsPedidos en el body de respuesta
      expect(response.body.itemsPedidos[0].items).toHaveLength(2)
      expect(
        response.body.itemsPedidos[0].items.every(
          (it: any) => it.estadoFisico === EstadoFisicoItem.PREPARADO,
        ),
      ).toBe(true)
    })

    it('Lista -> Enviada: debe actualizar con repartidor y vehículo, y los items siguen Preparado (200 OK)', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Pedro Pascal',
          cliente_direccion: 'Santiago 50',
          estado: EstadoOrden.LISTA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      await db
        .insertInto('items_pedidos')
        .values({
          orden_id: orden.id,
          producto_sku: 'PROD-001',
          cantidad: 1,
        })
        .execute()

      await db
        .insertInto('items')
        .values({
          producto_sku: 'PROD-001',
          estado_fisico: EstadoFisicoItem.PREPARADO,
          orden_id: orden.id,
        })
        .execute()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-101',
        vehiculoId: 1,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.ENVIADA)
      expect(response.body.repartidorLegajo).toBe('REP-101')
      expect(response.body.vehiculoId).toBe(1)

      // Items siguen en Preparado
      const itemsEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', orden.id)
        .execute()

      expect(itemsEnDb).toHaveLength(1)
      expect(itemsEnDb[0].estado_fisico).toBe(EstadoFisicoItem.PREPARADO)
    })

    it('Enviada -> Completada: debe setear fechaCompletada y los items físicos pasan a Entregado (200 OK)', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Laura Pausini',
          cliente_direccion: 'Roma 123',
          estado: EstadoOrden.ENVIADA,
          fecha_completada: null,
          repartidor_legajo: 'REP-101',
          vehiculo_id: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      await db
        .insertInto('items_pedidos')
        .values({
          orden_id: orden.id,
          producto_sku: 'PROD-001',
          cantidad: 1,
        })
        .execute()

      await db
        .insertInto('items')
        .values({
          producto_sku: 'PROD-001',
          estado_fisico: EstadoFisicoItem.PREPARADO,
          orden_id: orden.id,
        })
        .execute()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.COMPLETADA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.COMPLETADA)
      expect(response.body.fechaCompletada).not.toBeNull()
      expect(new Date(response.body.fechaCompletada).getTime()).not.toBeNaN()

      // Verificación en PostgreSQL: items físicos pasaron a Entregado
      const itemsEnDb = await db
        .selectFrom('items')
        .selectAll()
        .where('orden_id', '=', orden.id)
        .execute()

      expect(itemsEnDb).toHaveLength(1)
      expect(itemsEnDb[0].estado_fisico).toBe(EstadoFisicoItem.ENTREGADO)

      // Verificación en PostgreSQL: fecha_completada seteada
      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirst()

      expect(ordenEnDb?.fecha_completada).not.toBeNull()
    })

    it('debe rechazar (400 Bad Request) la transición directa Pedida -> Enviada', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Test Inválido',
          cliente_direccion: 'Calle 1',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-101',
        vehiculoId: 1,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe rechazar (400 Bad Request) la transición directa Lista -> Completada', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Test Inválido',
          cliente_direccion: 'Calle 2',
          estado: EstadoOrden.LISTA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.COMPLETADA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe rechazar (400 Bad Request) el paso a Enviada sin repartidorLegajo', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Sin Repartidor',
          cliente_direccion: 'Calle 3',
          estado: EstadoOrden.LISTA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
        vehiculoId: 1,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe rechazar (400 Bad Request) el paso a Enviada sin vehiculoId', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Sin Vehículo',
          cliente_direccion: 'Calle 4',
          estado: EstadoOrden.LISTA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-101',
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe rechazar (409 Conflict) cualquier intento de cambiar el estado de una orden ya Completada', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Orden Ya Completada',
          cliente_direccion: 'Calle 5',
          estado: EstadoOrden.COMPLETADA,
          fecha_completada: new Date(),
          repartidor_legajo: 'REP-101',
          vehiculo_id: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.PEDIDA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(409)

      expect(response.body.statusCode).toBe(409)
    })

    it('debe responder 409 Conflict si se solicita cambiar al mismo estado actual', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Lucía Méndez',
          cliente_direccion: 'Córdoba 300',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.PEDIDA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(409)

      expect(response.body.statusCode).toBe(409)
    })
  })
})
