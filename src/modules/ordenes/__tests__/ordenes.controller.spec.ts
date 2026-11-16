import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { EstadoFisicoItem } from '../../inventario/entities/item.entity'
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
    itemsPedidos: [
      {
        id: 1,
        productoSku: 'SKU-01',
        cantidad: 1,
        items: [
          {
            id: 10,
            productoSku: 'SKU-01',
            estadoFisico: EstadoFisicoItem.RESERVADO,
            ordenId: 1,
          },
        ],
      },
    ],
  }

  const mockPaginatedOrdenes: PaginatedResponseDto<Orden> = {
    data: [mockOrden],
    offset: 0,
    pageSize: 10,
    hasNextPage: false,
  }

  beforeEach(async () => {
    service = {
      findById: jest.fn(),
      findAll: jest.fn(),
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

    it('el shape de respuesta incluye itemsPedidos e items físicos', async () => {
      ;(service.findById as jest.Mock).mockResolvedValue(mockOrden)

      const result = await controller.findById(1)
      expect(result.itemsPedidos).toBeDefined()
      expect(result.itemsPedidos).toHaveLength(1)
      expect(result.itemsPedidos[0].productoSku).toBe('SKU-01')
      expect(result.itemsPedidos[0].cantidad).toBe(1)
      expect(result.itemsPedidos[0].items).toHaveLength(1)
      expect(result.itemsPedidos[0].items[0].estadoFisico).toBe(EstadoFisicoItem.RESERVADO)
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

  describe('findAll', () => {
    it('GET /ordenes sin query invoca service.findAll() y retorna 200 con respuesta paginada', async () => {
      ;(service.findAll as jest.Mock).mockResolvedValue(mockPaginatedOrdenes)

      const result = await controller.findAll()
      expect(result).toEqual(mockPaginatedOrdenes)
      expect(result.data).toEqual([mockOrden])
      expect(result.offset).toBe(0)
      expect(result.pageSize).toBe(10)
      expect(result.hasNextPage).toBe(false)
      expect(service.findAll).toHaveBeenCalledWith(undefined)
    })

    it('GET /ordenes?estado=Pedida pasa { estado: EstadoOrden.PEDIDA } al service', async () => {
      ;(service.findAll as jest.Mock).mockResolvedValue(mockPaginatedOrdenes)

      const query = { estado: EstadoOrden.PEDIDA }
      const result = await controller.findAll(query)
      expect(result).toEqual(mockPaginatedOrdenes)
      expect(service.findAll).toHaveBeenCalledWith(query)
    })

    it('GET /ordenes?pageSize=5&offset=10 pasa parámetros de paginación al service', async () => {
      ;(service.findAll as jest.Mock).mockResolvedValue(mockPaginatedOrdenes)

      const query = { pageSize: 5, offset: 10 }
      const result = await controller.findAll(query)
      expect(result).toEqual(mockPaginatedOrdenes)
      expect(service.findAll).toHaveBeenCalledWith(query)
    })

    it('GET /ordenes con estado y paginación combina todos los filtros hacia el service', async () => {
      ;(service.findAll as jest.Mock).mockResolvedValue(mockPaginatedOrdenes)

      const filtros = { estado: EstadoOrden.PEDIDA, pageSize: 2, offset: 4 }
      const result = await controller.findAll(filtros)
      expect(result).toEqual(mockPaginatedOrdenes)
      expect(service.findAll).toHaveBeenCalledWith(filtros)
    })

    it('captura error inesperado en findAll y lanza InternalServerErrorException', async () => {
      ;(service.findAll as jest.Mock).mockRejectedValue(new Error('DB failure'))

      await expect(controller.findAll()).rejects.toThrow(InternalServerErrorException)
    })
  })
})
