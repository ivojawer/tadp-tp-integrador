import { Test, TestingModule } from '@nestjs/testing'
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
    it('debe invocar al repositorio y retornar la lista de estado de items', async () => {
      repository.obtenerEstadoItems.mockResolvedValue(mockEstadoItems)

      const result = await service.obtenerEstadoItems()

      expect(result).toEqual(mockEstadoItems)
      expect(repository.obtenerEstadoItems).toHaveBeenCalledTimes(1)
    })

    it('debe retornar lista vacía si el repositorio no encuentra items', async () => {
      repository.obtenerEstadoItems.mockResolvedValue([])

      const result = await service.obtenerEstadoItems()

      expect(result).toEqual([])
      expect(repository.obtenerEstadoItems).toHaveBeenCalledTimes(1)
    })
  })
})
