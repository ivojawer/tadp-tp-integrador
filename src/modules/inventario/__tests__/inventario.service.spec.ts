import { Test, TestingModule } from '@nestjs/testing'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { IItemsRepository, ITEMS_REPOSITORY } from '../repositories/items.repository'
import { InventarioService } from '../services/inventario.service'

describe('InventarioService', () => {
  let service: InventarioService
  let repository: jest.Mocked<IItemsRepository>

  const mockEstadoItems: EstadoItemsDto[] = [
    {
      sku: 'PROD-001',
      disponibles: 5,
      reservados: 2,
    },
    {
      sku: 'PROD-002',
      disponibles: 1,
      reservados: 0,
    },
  ]

  const mockPaginatedResponse: PaginatedResponseDto<EstadoItemsDto> = {
    data: mockEstadoItems,
    offset: 0,
    pageSize: 10,
    hasNextPage: false,
  }

  beforeEach(async () => {
    const mockRepo: jest.Mocked<IItemsRepository> = {
      crearItem: jest.fn(),
      countDisponibles: jest.fn(),
      reservar: jest.fn(),
      prepararPorOrden: jest.fn(),
      entregarPorOrden: jest.fn(),
      findByOrden: jest.fn(),
      obtenerEstadoItems: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventarioService,
        {
          provide: ITEMS_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile()

    service = module.get<InventarioService>(InventarioService)
    repository = module.get(ITEMS_REPOSITORY)
  })

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined()
  })

  describe('obtenerEstadoItems', () => {
    it('debe invocar al repositorio y retornar la respuesta paginada', async () => {
      repository.obtenerEstadoItems.mockResolvedValue(mockPaginatedResponse)

      const result = await service.obtenerEstadoItems()

      expect(result).toEqual(mockPaginatedResponse)
      expect(result.data).toEqual(mockEstadoItems)
      expect(repository.obtenerEstadoItems).toHaveBeenCalledTimes(1)
    })

    it('debe invocar al repositorio pasando opciones de paginación', async () => {
      const customResponse: PaginatedResponseDto<EstadoItemsDto> = {
        data: [mockEstadoItems[0]],
        offset: 0,
        pageSize: 1,
        hasNextPage: true,
      }
      repository.obtenerEstadoItems.mockResolvedValue(customResponse)

      const pagination = { pageSize: 1, offset: 0 }
      const result = await service.obtenerEstadoItems(pagination)

      expect(result).toEqual(customResponse)
      expect(result.hasNextPage).toBe(true)
      expect(repository.obtenerEstadoItems).toHaveBeenCalledWith(pagination)
    })

    it('debe retornar lista vacía en data si el repositorio no encuentra items', async () => {
      const emptyResponse: PaginatedResponseDto<EstadoItemsDto> = {
        data: [],
        offset: 0,
        pageSize: 10,
        hasNextPage: false,
      }
      repository.obtenerEstadoItems.mockResolvedValue(emptyResponse)

      const result = await service.obtenerEstadoItems()

      expect(result).toEqual(emptyResponse)
      expect(result.data).toEqual([])
      expect(repository.obtenerEstadoItems).toHaveBeenCalledTimes(1)
    })
  })
})
