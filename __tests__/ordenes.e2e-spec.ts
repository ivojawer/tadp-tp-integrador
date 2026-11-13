import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { KYSELY_DB } from '../src/common/database/database.provider'
import { Database } from '../src/common/database/types'
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter'
import { CreateOrdenDto } from '../src/modules/ordenes/dto/create-orden.dto'
import { UpdateEstadoOrdenDto } from '../src/modules/ordenes/dto/update-estado-orden.dto'
import { EstadoOrden } from '../src/modules/ordenes/entities/orden.entity'

describe('Ordenes (e2e)', () => {
  let app: INestApplication
  let db: Kysely<Database>

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
  })

  afterAll(async () => {
    if (db) {
      await db.deleteFrom('items_pedidos').execute()
      await db.deleteFrom('ordenes').execute()
      await db.destroy()
    }
    if (app) {
      await app.close()
    }
  })

  beforeEach(async () => {
    // Limpieza de datos transaccionales antes de cada prueba para aislamiento
    await db.deleteFrom('items_pedidos').execute()
    await db.deleteFrom('ordenes').execute()
  })

  describe('POST /ordenes', () => {
    it('debe persistir una orden con sus items en PostgreSQL y retornar 201 Created', async () => {
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
      })

      // Verificación directa contra PostgreSQL
      const ordenGuardada = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', response.body.id)
        .executeTakeFirst()

      expect(ordenGuardada).toBeDefined()
      expect(ordenGuardada?.cliente_nombre).toBe('Juan Pérez')
      expect(ordenGuardada?.estado).toBe(EstadoOrden.PEDIDA)

      const itemsGuardados = await db
        .selectFrom('items_pedidos')
        .selectAll()
        .where('orden_id', '=', response.body.id)
        .execute()

      expect(itemsGuardados).toHaveLength(2)
      expect(itemsGuardados).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ producto_sku: 'PROD-001', cantidad: 2 }),
          expect.objectContaining({ producto_sku: 'PROD-002', cantidad: 1 }),
        ]),
      )
    })

    it('debe retornar 400 Bad Request si faltan datos requeridos (ValidationPipe)', async () => {
      const invalidPayload = {
        clienteNombre: '',
        clienteDireccion: 'Calle Falsa 123',
      }

      const response = await request(app.getHttpServer())
        .post('/ordenes')
        .send(invalidPayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
      expect(response.body.error).toBeDefined()
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
  })

  describe('GET /ordenes/:id', () => {
    it('debe recuperar una orden previamente persistida en la base de datos (200 OK)', async () => {
      // Inserción previa directamente en PostgreSQL
      const ordenInsertada = await db
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

      const response = await request(app.getHttpServer())
        .get(`/ordenes/${ordenInsertada.id}`)
        .expect(200)

      expect(response.body).toEqual({
        id: ordenInsertada.id,
        clienteNombre: 'Carlos Gómez',
        clienteDireccion: 'Brandsen 805',
        estado: EstadoOrden.PEDIDA,
        fechaCompletada: null,
        repartidorLegajo: null,
        vehiculoId: null,
      })
    })

    it('debe retornar 404 Not Found si la orden no existe en la base de datos', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/999999').expect(404)

      expect(response.body.statusCode).toBe(404)
    })

    it('debe retornar 400 Bad Request si el id no es un entero válido', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/id-no-valido').expect(400)

      expect(response.body.statusCode).toBe(400)
    })
  })

  describe('PATCH /ordenes/:id/estado', () => {
    it('debe actualizar el estado en PostgreSQL de Pedida a Lista (200 OK)', async () => {
      const orden = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Ana Frank',
          cliente_direccion: 'Amsterdam 100',
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.LISTA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.LISTA)

      // Verificación en la base de datos
      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirst()

      expect(ordenEnDb?.estado).toBe(EstadoOrden.LISTA)
    })

    it('debe rechazar (400 Bad Request) el paso a Enviada sin asignar repartidor ni vehículo', async () => {
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

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe permitir transicionar a Enviada asignando repartidor y vehículo válidos existentes (200 OK)', async () => {
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

      // REP-101 y vehiculo 1 existen por las seeds de la base de datos
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

      // Verificación en PostgreSQL
      const ordenEnDb = await db
        .selectFrom('ordenes')
        .selectAll()
        .where('id', '=', orden.id)
        .executeTakeFirst()

      expect(ordenEnDb?.estado).toBe(EstadoOrden.ENVIADA)
      expect(ordenEnDb?.repartidor_legajo).toBe('REP-101')
      expect(ordenEnDb?.vehiculo_id).toBe(1)
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
