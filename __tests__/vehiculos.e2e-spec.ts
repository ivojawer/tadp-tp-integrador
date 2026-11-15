import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { KYSELY_DB } from '../src/common/database/database.provider'
import { Database } from '../src/common/database/types'
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter'

describe('Vehiculos (e2e)', () => {
  let app: INestApplication
  let db: Kysely<Database>

  const cleanTables = async (): Promise<void> => {
    await db.updateTable('ordenes').set({ vehiculo_id: null }).execute()
    await db.deleteFrom('geo_logs').execute()
    await db.deleteFrom('vehiculos').execute()
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

  describe('POST /vehiculos', () => {
    it('debe registrar un vehículo con datos válidos y retornar 201 con id generado', async () => {
      const payload = {
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      }

      const response = await request(app.getHttpServer())
        .post('/vehiculos')
        .send(payload)
        .expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      })

      // Verificar persistencia en DB
      const enDb = await db
        .selectFrom('vehiculos')
        .where('id', '=', response.body.id)
        .selectAll()
        .executeTakeFirst()

      expect(enDb).toBeDefined()
      expect(enDb?.modelo).toBe('Renault Kangoo')
      expect(Number(enDb?.capacidad_volumen)).toBe(3.0)
      expect(Number(enDb?.capacidad_peso)).toBe(650.0)
    })

    it('debe responder 400 cuando faltan campos obligatorios', async () => {
      const payloadIncompleto = {
        modelo: 'Peugeot Partner',
        // falta capacidadVolumen y capacidadPeso
      }

      const response = await request(app.getHttpServer())
        .post('/vehiculos')
        .send(payloadIncompleto)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })
  })

  describe('GET /vehiculos', () => {
    it('debe retornar 200 con la lista que incluye los vehículos creados', async () => {
      await request(app.getHttpServer())
        .post('/vehiculos')
        .send({ modelo: 'Vehiculo 1', capacidadVolumen: 2.5, capacidadPeso: 500 })
        .expect(201)

      await request(app.getHttpServer())
        .post('/vehiculos')
        .send({ modelo: 'Vehiculo 2', capacidadVolumen: 5.0, capacidadPeso: 1000 })
        .expect(201)

      const response = await request(app.getHttpServer()).get('/vehiculos').expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThanOrEqual(2)
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ modelo: 'Vehiculo 1' }),
          expect.objectContaining({ modelo: 'Vehiculo 2' }),
        ]),
      )
    })
  })

  describe('GET /vehiculos/:id', () => {
    it('debe retornar 200 y el detalle del vehículo existente', async () => {
      const created = await request(app.getHttpServer())
        .post('/vehiculos')
        .send({ modelo: 'Mercedes Sprinter', capacidadVolumen: 12.0, capacidadPeso: 1800 })
        .expect(201)

      const vehiculoId = created.body.id

      const response = await request(app.getHttpServer())
        .get(`/vehiculos/${vehiculoId}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: vehiculoId,
        modelo: 'Mercedes Sprinter',
        capacidadVolumen: 12.0,
        capacidadPeso: 1800,
      })
    })

    it('debe retornar 404 cuando el vehículo no existe', async () => {
      const response = await request(app.getHttpServer()).get('/vehiculos/999999').expect(404)

      expect(response.body.statusCode).toBe(404)
    })
  })
})
