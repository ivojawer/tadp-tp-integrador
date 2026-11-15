import { InternalServerErrorException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
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
    it('debe retornar la lista de estado de items con 200 OK', async () => {
      ;(service.obtenerEstadoItems as jest.Mock).mockResolvedValue(mockEstadoItems)

      const result = await controller.obtenerEstadoItems()

      expect(result).toEqual(mockEstadoItems)
      expect(service.obtenerEstadoItems).toHaveBeenCalledTimes(1)
    })

    it('debe capturar errores inesperados y lanzar InternalServerErrorException', async () => {
      ;(service.obtenerEstadoItems as jest.Mock).mockRejectedValue(new Error('Fallo de conexión'))

      await expect(controller.obtenerEstadoItems()).rejects.toThrow(InternalServerErrorException)
    })
  })
})
