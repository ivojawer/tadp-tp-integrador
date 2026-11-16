import { InternalServerErrorException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { InventarioController } from '../controllers/inventario.controller'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { InventarioService } from '../services/inventario.service'

describe('InventarioController', () => {
  let controller: InventarioController
  let service: jest.Mocked<Partial<InventarioService>>

  const mockEstadoItems: EstadoItemsDto[] = [
    {
      sku: 'PROD-001',
      disponibles: 10,
      reservados: 3,
    },
    {
      sku: 'PROD-002',
      disponibles: 0,
      reservados: 1,
    },
  ]

  const mockPaginatedResponse: PaginatedResponseDto<EstadoItemsDto> = {
    data: mockEstadoItems,
    offset: 0,
    pageSize: 10,
    hasNextPage: false,
  }

  beforeEach(async () => {
    service = {
      obtenerEstadoItems: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventarioController],
      providers: [
        {
          provide: InventarioService,
          useValue: service,
        },
      ],
    }).compile()

    controller = module.get<InventarioController>(InventarioController)
  })

  it('debe estar definido el controlador', () => {
    expect(controller).toBeDefined()
  })

  describe('obtenerEstadoItems', () => {
    it('debe retornar la lista paginada de estado de items con 200 OK', async () => {
      ;(service.obtenerEstadoItems as jest.Mock).mockResolvedValue(mockPaginatedResponse)

      const result = await controller.obtenerEstadoItems()

      expect(result).toEqual(mockPaginatedResponse)
      expect(result.data).toEqual(mockEstadoItems)
      expect(result.offset).toBe(0)
      expect(result.pageSize).toBe(10)
      expect(result.hasNextPage).toBe(false)
      expect(service.obtenerEstadoItems).toHaveBeenCalledWith(undefined)
    })

    it('debe invocar al servicio pasando parámetros de paginación pageSize y offset', async () => {
      const customResponse: PaginatedResponseDto<EstadoItemsDto> = {
        data: [mockEstadoItems[0]],
        offset: 1,
        pageSize: 1,
        hasNextPage: true,
      }
      ;(service.obtenerEstadoItems as jest.Mock).mockResolvedValue(customResponse)

      const paginationQuery = { pageSize: 1, offset: 1 }
      const result = await controller.obtenerEstadoItems(paginationQuery)

      expect(result).toEqual(customResponse)
      expect(result.hasNextPage).toBe(true)
      expect(service.obtenerEstadoItems).toHaveBeenCalledWith(paginationQuery)
    })

    it('debe capturar errores inesperados y lanzar InternalServerErrorException', async () => {
      ;(service.obtenerEstadoItems as jest.Mock).mockRejectedValue(new Error('Fallo de conexión'))

      await expect(controller.obtenerEstadoItems()).rejects.toThrow(InternalServerErrorException)
    })
  })
})
