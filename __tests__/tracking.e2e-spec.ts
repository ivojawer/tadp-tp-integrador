import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import { io, Socket } from 'socket.io-client'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { KYSELY_DB } from '../src/common/database/database.provider'
import { Database } from '../src/common/database/types'
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter'
import { EstadoOrden } from '../src/modules/ordenes/entities/orden.entity'

describe('Tracking (e2e)', () => {
  let app: INestApplication
  let db: Kysely<Database>
  let serverUrl: string
  let testVehiculoId: number
  let testOrdenEnviadaId: number
  let testOrdenPedidaId: number
  let testOrdenSinVehiculoId: number
  const socketsToClose: Socket[] = []

  const cleanTables = async (): Promise<void> => {
    await db.deleteFrom('geo_logs').execute()
    await db.updateTable('ordenes').set({ vehiculo_id: null, repartidor_legajo: null }).execute()
    await db.deleteFrom('items').execute()
    await db.deleteFrom('items_pedidos').execute()
    await db.deleteFrom('ordenes').execute()
    await db.deleteFrom('vehiculos').execute()
  }

  const createSocketClient = (): Promise<Socket> => {
    return new Promise((resolve, reject) => {
      const socket = io(`${serverUrl}/tracking`, {
        transports: ['websocket'],
        forceNew: true,
      })

      socket.on('connect', () => {
        socketsToClose.push(socket)
        resolve(socket)
      })

      socket.on('connect_error', (err) => {
        reject(err)
      })
    })
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

    await app.listen(0)
    const address = app.getHttpServer().address()
    const port = typeof address === 'string' ? address : address.port
    serverUrl = `http://127.0.0.1:${port}`

    db = moduleFixture.get<Kysely<Database>>(KYSELY_DB)
  })

  afterAll(async () => {
    for (const s of socketsToClose) {
      if (s.connected) s.disconnect()
    }
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

    // Sembrar vehículo
    const vehiculo = await db
      .insertInto('vehiculos')
      .values({
        modelo: 'Renault Kangoo Test',
        capacidad_volumen: 3.0,
        capacidad_peso: 650.0,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testVehiculoId = vehiculo.id

    // Sembrar orden en estado Enviada con el vehículo
    const ordenEnviada = await db
      .insertInto('ordenes')
      .values({
        cliente_nombre: 'Cliente Enviada',
        cliente_direccion: 'Calle Test 123',
        estado: EstadoOrden.ENVIADA,
        vehiculo_id: testVehiculoId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testOrdenEnviadaId = ordenEnviada.id

    // Sembrar orden en estado Pedida
    const ordenPedida = await db
      .insertInto('ordenes')
      .values({
        cliente_nombre: 'Cliente Pedida',
        cliente_direccion: 'Calle Pedida 456',
        estado: EstadoOrden.PEDIDA,
        vehiculo_id: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testOrdenPedidaId = ordenPedida.id

    // Sembrar orden sin vehículo
    const ordenSinVehiculo = await db
      .insertInto('ordenes')
      .values({
        cliente_nombre: 'Cliente Sin Vehiculo',
        cliente_direccion: 'Calle Sin 789',
        estado: EstadoOrden.LISTA,
        vehiculo_id: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    testOrdenSinVehiculoId = ordenSinVehiculo.id
  })

  afterEach(() => {
    while (socketsToClose.length > 0) {
      const s = socketsToClose.pop()
      if (s?.connected) s.disconnect()
    }
  })

  describe('Tracking REST API', () => {
    describe('GET /tracking/ordenes/:ordenId/historial', () => {
      it('sin logs (vehículo sin posiciones registradas) → 200 con array vacío', async () => {
        const response = await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenEnviadaId}/historial`)
          .expect(200)

        expect(response.body).toEqual([])
      })

      it('con logs previos → 200 con array ordenado por fecha_hora ASC', async () => {
        const fecha1 = new Date('2026-11-15T10:00:00Z')
        const fecha2 = new Date('2026-11-15T12:00:00Z')
        const fecha3 = new Date('2026-11-15T11:00:00Z')

        await db
          .insertInto('geo_logs')
          .values([
            { vehiculo_id: testVehiculoId, latitud: -34.1, longitud: -58.1, fecha_hora: fecha1 },
            { vehiculo_id: testVehiculoId, latitud: -34.2, longitud: -58.2, fecha_hora: fecha2 },
            { vehiculo_id: testVehiculoId, latitud: -34.3, longitud: -58.3, fecha_hora: fecha3 },
          ])
          .execute()

        const response = await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenEnviadaId}/historial`)
          .expect(200)

        expect(response.body).toHaveLength(3)
        expect(new Date(response.body[0].fechaHora).getTime()).toBe(fecha1.getTime())
        expect(new Date(response.body[1].fechaHora).getTime()).toBe(fecha3.getTime())
        expect(new Date(response.body[2].fechaHora).getTime()).toBe(fecha2.getTime())
      })

      it('orden sin vehiculoId (no enviada) → 200 con array vacío', async () => {
        const response = await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenSinVehiculoId}/historial`)
          .expect(200)

        expect(response.body).toEqual([])
      })

      it('orden inexistente → 404', async () => {
        await request(app.getHttpServer()).get('/tracking/ordenes/999999/historial').expect(404)
      })
    })

    describe('GET /tracking/ordenes/:ordenId/ultima-posicion', () => {
      it('vehículo sin logs → 404', async () => {
        await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenEnviadaId}/ultima-posicion`)
          .expect(404)
      })

      it('con logs → 200 con el más reciente', async () => {
        const fechaVieja = new Date('2026-11-15T10:00:00Z')
        const fechaReciente = new Date('2026-11-15T14:00:00Z')

        await db
          .insertInto('geo_logs')
          .values([
            {
              vehiculo_id: testVehiculoId,
              latitud: -34.1,
              longitud: -58.1,
              fecha_hora: fechaVieja,
            },
            {
              vehiculo_id: testVehiculoId,
              latitud: -34.9,
              longitud: -58.9,
              fecha_hora: fechaReciente,
            },
          ])
          .execute()

        const response = await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenEnviadaId}/ultima-posicion`)
          .expect(200)

        expect(response.body).toMatchObject({
          vehiculoId: testVehiculoId,
          latitud: -34.9,
          longitud: -58.9,
        })
        expect(new Date(response.body.fechaHora).getTime()).toBe(fechaReciente.getTime())
      })

      it('orden sin vehículo asignado → 404', async () => {
        const response = await request(app.getHttpServer())
          .get(`/tracking/ordenes/${testOrdenSinVehiculoId}/ultima-posicion`)
          .expect(404)

        expect(response.body.message).toContain('vehículo')
      })
    })
  })

  describe('Tracking WebSocket Gateway', () => {
    it('cliente se suscribe a orden Enviada y recibe última posición si existe', async () => {
      const fechaLog = new Date('2026-11-15T13:00:00Z')
      await db
        .insertInto('geo_logs')
        .values({
          vehiculo_id: testVehiculoId,
          latitud: -34.6037,
          longitud: -58.3816,
          fecha_hora: fechaLog,
        })
        .execute()

      const client = await createSocketClient()

      const ubicacionPromise = new Promise<any>((resolve) => {
        client.on('tracking:ubicacion', (data) => resolve(data))
      })

      client.emit('tracking:suscribir', { ordenId: testOrdenEnviadaId })

      const ubicacion = await ubicacionPromise
      expect(ubicacion.vehiculoId).toBe(testVehiculoId)
      expect(ubicacion.latitud).toBeCloseTo(-34.6037)
      expect(ubicacion.longitud).toBeCloseTo(-58.3816)
    })

    it('repartidor publica ubicación → cliente suscrito recibe tracking:ubicacion y persiste en DB', async () => {
      const cliente = await createSocketClient()
      const repartidor = await createSocketClient()

      // Cliente se suscribe a la orden
      cliente.emit('tracking:suscribir', { ordenId: testOrdenEnviadaId })

      // Esperar brevemente para asegurar que el join a la room se completó
      await new Promise((resolve) => setTimeout(resolve, 50))

      const broadcastPromise = new Promise<any>((resolve) => {
        cliente.on('tracking:ubicacion', (data) => resolve(data))
      })

      // Repartidor publica ubicación
      repartidor.emit('tracking:publicar', {
        vehiculoId: testVehiculoId,
        latitud: -34.5555,
        longitud: -58.4444,
      })

      const recibido = await broadcastPromise
      expect(recibido.vehiculoId).toBe(testVehiculoId)
      expect(recibido.latitud).toBeCloseTo(-34.5555)
      expect(recibido.longitud).toBeCloseTo(-58.4444)
      expect(recibido.fechaHora).toBeDefined()

      // Verificar persistencia en DB
      const logs = await db
        .selectFrom('geo_logs')
        .where('vehiculo_id', '=', testVehiculoId)
        .selectAll()
        .execute()

      expect(logs).toHaveLength(1)
      expect(Number(logs[0].latitud)).toBeCloseTo(-34.5555)
      expect(Number(logs[0].longitud)).toBeCloseTo(-58.4444)
    })

    it('publicar con vehículo inexistente → repartidor recibe tracking:error y DB no tiene log nuevo', async () => {
      const repartidor = await createSocketClient()

      const errorPromise = new Promise<any>((resolve) => {
        repartidor.on('tracking:error', (data) => resolve(data))
      })

      repartidor.emit('tracking:publicar', {
        vehiculoId: 999999,
        latitud: -34.1,
        longitud: -58.1,
      })

      const error = await errorPromise
      expect(error.mensaje).toContain('no existe')

      const count = await db.selectFrom('geo_logs').selectAll().execute()
      expect(count).toHaveLength(0)
    })

    it('múltiples suscriptores a órdenes distintas del mismo vehículo → todos reciben el broadcast', async () => {
      // Crear segunda orden Enviada con el mismo vehículo
      const orden2 = await db
        .insertInto('ordenes')
        .values({
          cliente_nombre: 'Cliente 2',
          cliente_direccion: 'Calle 2',
          estado: EstadoOrden.ENVIADA,
          vehiculo_id: testVehiculoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      const cliente1 = await createSocketClient()
      const cliente2 = await createSocketClient()
      const repartidor = await createSocketClient()

      cliente1.emit('tracking:suscribir', { ordenId: testOrdenEnviadaId })
      cliente2.emit('tracking:suscribir', { ordenId: orden2.id })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const promise1 = new Promise<any>((resolve) => {
        cliente1.on('tracking:ubicacion', (data) => resolve(data))
      })
      const promise2 = new Promise<any>((resolve) => {
        cliente2.on('tracking:ubicacion', (data) => resolve(data))
      })

      repartidor.emit('tracking:publicar', {
        vehiculoId: testVehiculoId,
        latitud: -34.7777,
        longitud: -58.8888,
      })

      const [res1, res2] = await Promise.all([promise1, promise2])
      expect(res1.latitud).toBeCloseTo(-34.7777)
      expect(res2.latitud).toBeCloseTo(-34.7777)
    })

    it('suscribirse a orden inexistente → recibe tracking:error', async () => {
      const cliente = await createSocketClient()

      const errorPromise = new Promise<any>((resolve) => {
        cliente.on('tracking:error', (data) => resolve(data))
      })

      cliente.emit('tracking:suscribir', { ordenId: 888888 })

      const error = await errorPromise
      expect(error.mensaje).toContain('no existe')
    })

    it('suscribirse a orden en estado Pedida → recibe tracking:error', async () => {
      const cliente = await createSocketClient()

      const errorPromise = new Promise<any>((resolve) => {
        cliente.on('tracking:error', (data) => resolve(data))
      })

      cliente.emit('tracking:suscribir', { ordenId: testOrdenPedidaId })

      const error = await errorPromise
      expect(error.mensaje).toContain('Solo se pueden rastrear órdenes en estado Enviada')
    })
  })
})
