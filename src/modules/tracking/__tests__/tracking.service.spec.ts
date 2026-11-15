import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { OrdenesService } from '../../ordenes/services/ordenes.service'
import { Orden, EstadoOrden } from '../../ordenes/entities/orden.entity'
import { GeoLog } from '../entities/geo-log.entity'
import { IGeoLogsRepository, GEOLOGS_REPOSITORY } from '../repositories/geo-logs.repository'
import { TrackingService } from '../services/tracking.service'

const mockOrdenConVehiculo: Orden = {
  id: 1,
  clienteNombre: 'Test Cliente',
  clienteDireccion: 'Test Dirección',
  estado: EstadoOrden.ENVIADA,
  fechaCompletada: null,
  repartidorLegajo: 'REP-001',
  vehiculoId: 3,
  itemsPedidos: [],
}

const mockOrdenSinVehiculo: Orden = {
  ...mockOrdenConVehiculo,
  id: 2,
  vehiculoId: null,
  estado: EstadoOrden.LISTA,
}

const mockGeoLog: GeoLog = {
  id: 10,
  vehiculoId: 3,
  latitud: -34.6037,
  longitud: -58.3816,
  fechaHora: new Date('2024-01-01T12:00:00Z'),
}

const mockGeoLogMasReciente: GeoLog = {
  id: 11,
  vehiculoId: 3,
  latitud: -34.61,
  longitud: -58.39,
  fechaHora: new Date('2024-01-01T13:00:00Z'),
}

describe('TrackingService', () => {
  let service: TrackingService
  let ordenesService: jest.Mocked<OrdenesService>
  let geoLogsRepo: jest.Mocked<IGeoLogsRepository>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        {
          provide: OrdenesService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: GEOLOGS_REPOSITORY,
          useValue: {
            registrar: jest.fn(),
            findByVehiculo: jest.fn(),
            findUltimoByVehiculo: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<TrackingService>(TrackingService)
    ordenesService = module.get(OrdenesService)
    geoLogsRepo = module.get(GEOLOGS_REPOSITORY)
  })

  describe('historialPorOrden', () => {
    it('orden existente con vehículo y logs → llama findByVehiculo y retorna el array', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenConVehiculo)
      geoLogsRepo.findByVehiculo.mockResolvedValue([mockGeoLog, mockGeoLogMasReciente])

      const resultado = await service.historialPorOrden(1)

      expect(ordenesService.findById).toHaveBeenCalledWith(1)
      expect(geoLogsRepo.findByVehiculo).toHaveBeenCalledWith(3)
      expect(resultado).toEqual([mockGeoLog, mockGeoLogMasReciente])
    })

    it('orden inexistente → lanza NotFoundException', async () => {
      ordenesService.findById.mockRejectedValue(
        new NotFoundException('La orden con id 99 no fue encontrada'),
      )

      await expect(service.historialPorOrden(99)).rejects.toThrow(NotFoundException)
      expect(geoLogsRepo.findByVehiculo).not.toHaveBeenCalled()
    })

    it('orden existente sin vehiculoId (no enviada aún) → retorna [] sin llamar al repository', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenSinVehiculo)

      const resultado = await service.historialPorOrden(2)

      expect(resultado).toEqual([])
      expect(geoLogsRepo.findByVehiculo).not.toHaveBeenCalled()
    })
  })

  describe('ultimaPosicionPorOrden', () => {
    it('orden con vehículo y logs → retorna el GeoLog más reciente', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenConVehiculo)
      geoLogsRepo.findUltimoByVehiculo.mockResolvedValue(mockGeoLogMasReciente)

      const resultado = await service.ultimaPosicionPorOrden(1)

      expect(ordenesService.findById).toHaveBeenCalledWith(1)
      expect(geoLogsRepo.findUltimoByVehiculo).toHaveBeenCalledWith(3)
      expect(resultado).toEqual(mockGeoLogMasReciente)
    })

    it('orden sin vehiculoId → lanza NotFoundException', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenSinVehiculo)

      await expect(service.ultimaPosicionPorOrden(2)).rejects.toThrow(NotFoundException)
      await expect(service.ultimaPosicionPorOrden(2)).rejects.toThrow(
        'La orden aún no tiene vehículo asignado',
      )
      expect(geoLogsRepo.findUltimoByVehiculo).not.toHaveBeenCalled()
    })

    it('orden con vehículo pero sin logs → lanza NotFoundException', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenConVehiculo)
      geoLogsRepo.findUltimoByVehiculo.mockResolvedValue(null)

      await expect(service.ultimaPosicionPorOrden(1)).rejects.toThrow(NotFoundException)
    })
  })
})
