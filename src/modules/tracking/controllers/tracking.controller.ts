import {
  Controller,
  Get,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { GeoLog } from '../entities/geo-log.entity'
import { TrackingService } from '../services/tracking.service'

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('ordenes/:ordenId/historial')
  @ApiOperation({ summary: 'Obtener historial de posiciones de una orden' })
  @ApiParam({ name: 'ordenId', type: Number, description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Historial de posiciones del vehículo asignado a la orden',
    type: [GeoLog],
  })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async historialPorOrden(
    @Param('ordenId', ParseIntPipe) ordenId: number,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const historial = await this.trackingService.historialPorOrden(ordenId)
      res.status(HttpStatus.OK).json(historial)
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({ message: error.message })
      } else {
        throw new InternalServerErrorException()
      }
    }
  }

  @Get('ordenes/:ordenId/ultima-posicion')
  @ApiOperation({ summary: 'Obtener la última posición registrada de una orden' })
  @ApiParam({ name: 'ordenId', type: Number, description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Última posición registrada del vehículo asignado a la orden',
    type: GeoLog,
  })
  @ApiResponse({
    status: 404,
    description: 'Orden no encontrada, sin vehículo asignado, o sin registros de posición',
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async ultimaPosicionPorOrden(
    @Param('ordenId', ParseIntPipe) ordenId: number,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const geoLog = await this.trackingService.ultimaPosicionPorOrden(ordenId)
      res.status(HttpStatus.OK).json(geoLog)
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({ message: error.message })
      } else {
        throw new InternalServerErrorException()
      }
    }
  }
}
