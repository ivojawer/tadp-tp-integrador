import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { KYSELY_DB } from '../src/common/database/database.provider'
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter'
import { CreateOrdenDto } from '../src/modules/ordenes/dto/create-orden.dto'
import { UpdateEstadoOrdenDto } from '../src/modules/ordenes/dto/update-estado-orden.dto'
import { EstadoOrden, Orden } from '../src/modules/ordenes/entities/orden.entity'
import {
  IOrdenesRepository,
  ORDENES_REPOSITORY,
} from '../src/modules/ordenes/repositories/ordenes.repository'

class InMemoryOrdenesRepository implements IOrdenesRepository {
  private ordenes: Map<number, Orden> = new Map()
  private currentId = 1

  async findById(id: number): Promise<Orden | null> {
    const orden = this.ordenes.get(id)
    return orden ? { ...orden } : null
  }

  async create(data: {
    clienteNombre: string
    clienteDireccion: string
    items: { productoSku: string; cantidad: number }[]
  }): Promise<Orden> {
    const orden: Orden = {
      id: this.currentId++,
      clienteNombre: data.clienteNombre,
      clienteDireccion: data.clienteDireccion,
      estado: EstadoOrden.PEDIDA,
      fechaCompletada: null,
      repartidorLegajo: null,
      vehiculoId: null,
    }
    this.ordenes.set(orden.id, { ...orden })
    return { ...orden }
  }

  async updateEstado(
    id: number,
    nuevoEstado: EstadoOrden,
    options?: { repartidorLegajo?: string; vehiculoId?: number; fechaCompletada?: Date },
  ): Promise<Orden> {
    const orden = this.ordenes.get(id)
    if (!orden) {
      throw new Error(`Orden ${id} no encontrada`)
    }
    orden.estado = nuevoEstado
    if (options?.repartidorLegajo !== undefined) {
      orden.repartidorLegajo = options.repartidorLegajo
    }
    if (options?.vehiculoId !== undefined) {
      orden.vehiculoId = options.vehiculoId
    }
    if (options?.fechaCompletada !== undefined) {
      orden.fechaCompletada = options.fechaCompletada
    }
    this.ordenes.set(id, { ...orden })
    return { ...orden }
  }

  reset(): void {
    this.ordenes.clear()
    this.currentId = 1
  }
}

describe('Ordenes (e2e)', () => {
  let app: INestApplication
  let repository: InMemoryOrdenesRepository

  beforeAll(async () => {
    repository = new InMemoryOrdenesRepository()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KYSELY_DB)
      .useValue({})
      .overrideProvider(ORDENES_REPOSITORY)
      .useValue(repository)
      .compile()

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
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    repository.reset()
  })

  describe('POST /ordenes', () => {
    it('debe crear una orden exitosamente (201 Created)', async () => {
      const payload: CreateOrdenDto = {
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Av. Corrientes 1234, CABA',
        items: [
          { productoSku: 'PROD-001', cantidad: 2 },
          { productoSku: 'PROD-002', cantidad: 1 },
        ],
      }

      const response = await request(app.getHttpServer()).post('/ordenes').send(payload).expect(201)

      expect(response.body).toEqual({
        id: 1,
        clienteNombre: payload.clienteNombre,
        clienteDireccion: payload.clienteDireccion,
        estado: EstadoOrden.PEDIDA,
        fechaCompletada: null,
        repartidorLegajo: null,
        vehiculoId: null,
      })
    })

    it('debe retornar 400 Bad Request si faltan campos obligatorios', async () => {
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
      const payloadConItemsVacios = {
        clienteNombre: 'María López',
        clienteDireccion: 'Av. Santa Fe 2000',
        items: [],
      }

      const response = await request(app.getHttpServer())
        .post('/ordenes')
        .send(payloadConItemsVacios)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })
  })

  describe('GET /ordenes/:id', () => {
    it('debe retornar una orden existente (200 OK)', async () => {
      const creada = await repository.create({
        clienteNombre: 'Carlos Tevez',
        clienteDireccion: 'Brandsen 805',
        items: [{ productoSku: 'PROD-BOCA', cantidad: 1 }],
      })

      const response = await request(app.getHttpServer()).get(`/ordenes/${creada.id}`).expect(200)

      expect(response.body).toEqual({
        id: creada.id,
        clienteNombre: 'Carlos Tevez',
        clienteDireccion: 'Brandsen 805',
        estado: EstadoOrden.PEDIDA,
        fechaCompletada: null,
        repartidorLegajo: null,
        vehiculoId: null,
      })
    })

    it('debe retornar 404 Not Found cuando la orden no existe', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/999').expect(404)

      expect(response.body.statusCode).toBe(404)
    })

    it('debe retornar 400 Bad Request cuando el id no es numérico', async () => {
      const response = await request(app.getHttpServer()).get('/ordenes/abc').expect(400)

      expect(response.body.statusCode).toBe(400)
    })
  })

  describe('PATCH /ordenes/:id/estado', () => {
    it('debe transicionar orden de Pedida a Lista correctamente (200 OK)', async () => {
      const orden = await repository.create({
        clienteNombre: 'Ana Frank',
        clienteDireccion: 'Amsterdam 100',
        items: [{ productoSku: 'LIBRO-01', cantidad: 1 }],
      })

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.LISTA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.LISTA)
    })

    it('debe fallar (400 Bad Request) si pasa a Enviada sin repartidor ni vehículo', async () => {
      const orden = await repository.create({
        clienteNombre: 'Pedro Pascal',
        clienteDireccion: 'Santiago 50',
        items: [{ productoSku: 'PROD-01', cantidad: 1 }],
      })
      await repository.updateEstado(orden.id, EstadoOrden.LISTA)

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(400)

      expect(response.body.statusCode).toBe(400)
    })

    it('debe permitir transicionar a Enviada con repartidor y vehículo asignados (200 OK)', async () => {
      const orden = await repository.create({
        clienteNombre: 'Pedro Pascal',
        clienteDireccion: 'Santiago 50',
        items: [{ productoSku: 'PROD-01', cantidad: 1 }],
      })
      await repository.updateEstado(orden.id, EstadoOrden.LISTA)

      const updatePayload: UpdateEstadoOrdenDto = {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-007',
        vehiculoId: 2,
      }

      const response = await request(app.getHttpServer())
        .patch(`/ordenes/${orden.id}/estado`)
        .send(updatePayload)
        .expect(200)

      expect(response.body.estado).toBe(EstadoOrden.ENVIADA)
      expect(response.body.repartidorLegajo).toBe('REP-007')
      expect(response.body.vehiculoId).toBe(2)
    })

    it('debe retornar 409 Conflict si se intenta pasar al mismo estado actual', async () => {
      const orden = await repository.create({
        clienteNombre: 'Lucía Méndez',
        clienteDireccion: 'Cordoba 300',
        items: [{ productoSku: 'PROD-01', cantidad: 1 }],
      })

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
