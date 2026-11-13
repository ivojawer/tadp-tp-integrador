import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { OrdenesController } from '../controllers/ordenes.controller'
import { EstadoOrden, Orden } from '../entities/orden.entity'
import { OrdenesService } from '../services/ordenes.service'

describe('OrdenesController', () => {
  let controller: OrdenesController
  let service: jest.Mocked<Partial<OrdenesService>>

  const mockOrden: Orden = {
    id: 1,
    clienteNombre: 'María López',
    clienteDireccion: 'Belgrano 456',
    estado: EstadoOrden.PEDIDA,
    fechaCompletada: null,
    repartidorLegajo: null,
    vehiculoId: null,
  }

  beforeEach(async () => {
    service = {
      findById: jest.fn(),
      create: jest.fn(),
      cambiarEstado: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [
        {
          provide: OrdenesService,
          useValue: service,
        },
      ],
    }).compile()

    controller = module.get<OrdenesController>(OrdenesController)
  })

  it('debe estar definido el controlador', () => {
    expect(controller).toBeDefined()
  })

  describe('findById', () => {
    it('debe retornar la orden correctamente', async () => {
      ;(service.findById as jest.Mock).mockResolvedValue(mockOrden)

      const result = await controller.findById(1)
      expect(result).toEqual(mockOrden)
      expect(service.findById).toHaveBeenCalledWith(1)
    })

    it('debe propagar NotFoundException adecuadamente', async () => {
      ;(service.findById as jest.Mock).mockRejectedValue(new NotFoundException('No encontrada'))

      await expect(controller.findById(99)).rejects.toThrow(NotFoundException)
    })

    it('debe capturar errores inesperados y convertirlos en InternalServerErrorException', async () => {
      ;(service.findById as jest.Mock).mockRejectedValue(new Error('Fallo de conexión'))

      await expect(controller.findById(1)).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('create', () => {
    it('debe validar que items no esté vacío a nivel request', async () => {
      await expect(
        controller.create({
          clienteNombre: 'Juan',
          clienteDireccion: 'Calle 1',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('debe invocar al servicio y retornar la orden creada', async () => {
      ;(service.create as jest.Mock).mockResolvedValue(mockOrden)

      const dto = {
        clienteNombre: 'Juan',
        clienteDireccion: 'Calle 1',
        items: [{ productoSku: 'SKU-01', cantidad: 1 }],
      }

      const result = await controller.create(dto)
      expect(result).toEqual(mockOrden)
      expect(service.create).toHaveBeenCalledWith(dto)
    })
  })
})
