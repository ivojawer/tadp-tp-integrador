import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { GeoLog } from '../entities/geo-log.entity'
import { TrackingController } from '../controllers/tracking.controller'
import { TrackingService } from '../services/tracking.service'

const mockGeoLog: GeoLog = {
  id: 10,
  vehiculoId: 3,
  latitud: -34.6037,
  longitud: -58.3816,
  fechaHora: new Date('2024-01-01T12:00:00Z'),
}

const mockResponse = () => {
  const res: Record<string, jest.Mock> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('TrackingController', () => {
  let controller: TrackingController
  let trackingService: jest.Mocked<TrackingService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [
        {
          provide: TrackingService,
          useValue: {
            historialPorOrden: jest.fn(),
            ultimaPosicionPorOrden: jest.fn(),
          },
        },
      ],
    }).compile()

    controller = module.get<TrackingController>(TrackingController)
    trackingService = module.get(TrackingService)
  })

  describe('GET /tracking/ordenes/:ordenId/historial', () => {
    it('200 con array de GeoLog para orden con historial', async () => {
      trackingService.historialPorOrden.mockResolvedValue([mockGeoLog])
      const res = mockResponse()

      await controller.historialPorOrden(1, res as any)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith([mockGeoLog])
    })

    it('404 cuando la orden no existe', async () => {
      trackingService.historialPorOrden.mockRejectedValue(
        new NotFoundException('La orden con id 99 no fue encontrada'),
      )
      const res = mockResponse()

      await controller.historialPorOrden(99, res as any)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('GET /tracking/ordenes/:ordenId/ultima-posicion', () => {
    it('200 con GeoLog para orden con posición registrada', async () => {
      trackingService.ultimaPosicionPorOrden.mockResolvedValue(mockGeoLog)
      const res = mockResponse()

      await controller.ultimaPosicionPorOrden(1, res as any)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(mockGeoLog)
    })

    it('404 cuando la orden no tiene vehículo o no tiene registros de posición', async () => {
      trackingService.ultimaPosicionPorOrden.mockRejectedValue(
        new NotFoundException('La orden aún no tiene vehículo asignado'),
      )
      const res = mockResponse()

      await controller.ultimaPosicionPorOrden(2, res as any)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
