import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { OrdenesService } from '../../ordenes/services/ordenes.service'
import { GeoLog } from '../entities/geo-log.entity'
import { GEOLOGS_REPOSITORY, IGeoLogsRepository } from '../repositories/geo-logs.repository'

@Injectable()
export class TrackingService {
  constructor(
    private readonly ordenesService: OrdenesService,
    @Inject(GEOLOGS_REPOSITORY)
    private readonly geoLogsRepo: IGeoLogsRepository,
  ) {}

  async historialPorOrden(ordenId: number): Promise<GeoLog[]> {
    const orden = await this.ordenesService.findById(ordenId)

    if (!orden.vehiculoId) {
      return []
    }

    return this.geoLogsRepo.findByVehiculo(orden.vehiculoId)
  }

  async ultimaPosicionPorOrden(ordenId: number): Promise<GeoLog> {
    const orden = await this.ordenesService.findById(ordenId)

    if (!orden.vehiculoId) {
      throw new NotFoundException('La orden aún no tiene vehículo asignado')
    }

    const geoLog = await this.geoLogsRepo.findUltimoByVehiculo(orden.vehiculoId)

    if (!geoLog) {
      throw new NotFoundException(
        `No se encontraron registros de posición para el vehículo de la orden ${ordenId}`,
      )
    }

    return geoLog
  }

  async registrarUbicacion(data: {
    vehiculoId: number
    latitud: number
    longitud: number
  }): Promise<GeoLog> {
    return this.geoLogsRepo.registrar(data)
  }

  async findUltimoByVehiculo(vehiculoId: number): Promise<GeoLog | null> {
    return this.geoLogsRepo.findUltimoByVehiculo(vehiculoId)
  }
}
