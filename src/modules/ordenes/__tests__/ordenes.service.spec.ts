import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EstadoOrden, Orden } from '../entities/orden.entity'
import { IOrdenesRepository, ORDENES_REPOSITORY } from '../repositories/ordenes.repository'
import { OrdenesService } from '../services/ordenes.service'

describe('OrdenesService', () => {
  let service: OrdenesService
  let repository: jest.Mocked<IOrdenesRepository>

  const mockOrdenBase: Orden = {
    id: 1,
    clienteNombre: 'Juan Pérez',
    clienteDireccion: 'Calle 123',
    estado: EstadoOrden.PEDIDA,
    fechaCompletada: null,
    repartidorLegajo: null,
    vehiculoId: null,
  }

  beforeEach(async () => {
    const mockRepo: jest.Mocked<IOrdenesRepository> = {
      findById: jest.fn(),
      create: jest.fn(),
      updateEstado: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesService,
        {
          provide: ORDENES_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile()

    service = module.get<OrdenesService>(OrdenesService)
    repository = module.get(ORDENES_REPOSITORY)
  })

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined()
  })

  describe('findById', () => {
    it('debe retornar la orden si existe', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      const result = await service.findById(1)
      expect(result).toEqual(mockOrdenBase)
      expect(repository.findById).toHaveBeenCalledWith(1)
    })

    it('debe lanzar NotFoundException si la orden no existe', async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    it('debe crear y retornar una orden con estado Pedida', async () => {
      repository.create.mockResolvedValue(mockOrdenBase)

      const result = await service.create({
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Calle 123',
        items: [{ productoSku: 'SKU-01', cantidad: 2 }],
      })

      expect(result.estado).toBe(EstadoOrden.PEDIDA)
      expect(repository.create).toHaveBeenCalled()
    })
  })

  describe('cambiarEstado', () => {
    it('debe permitir transición válida de Pedida a Lista', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)
      repository.updateEstado.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      })

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.LISTA,
      })

      expect(result.estado).toBe(EstadoOrden.LISTA)
    })

    it('debe rechazar transición directa de Pedida a Enviada', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('debe exigir repartidor y vehículo para pasar a Enviada', async () => {
      repository.findById.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      })

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('debe rechazar transición si ya está completada', async () => {
      repository.findById.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.COMPLETADA,
      })

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.LISTA,
        }),
      ).rejects.toThrow(ConflictException)
    })
  })
})
