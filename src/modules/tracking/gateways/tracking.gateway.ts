import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { EstadoOrden } from '../../ordenes/entities/orden.entity'
import { OrdenesService } from '../../ordenes/services/ordenes.service'
import { VehiculosService } from '../../vehiculos/services/vehiculos.service'
import { PublicarUbicacionDto } from '../dto/publicar-ubicacion.dto'
import { SuscribirOrdenDto } from '../dto/suscribir-orden.dto'
import { TrackingService } from '../services/tracking.service'

@WebSocketGateway({
  namespace: '/tracking',
  cors: {
    origin: '*',
  },
})
export class TrackingGateway {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(TrackingGateway.name)

  constructor(
    private readonly trackingService: TrackingService,
    private readonly ordenesService: OrdenesService,
    private readonly vehiculosService: VehiculosService,
  ) {}

  @SubscribeMessage('tracking:suscribir')
  async handleSuscribir(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SuscribirOrdenDto,
  ): Promise<void> {
    try {
      if (!data || typeof data.ordenId !== 'number') {
        client.emit('tracking:error', { mensaje: 'Datos de suscripción inválidos' })
        return
      }

      let orden
      try {
        orden = await this.ordenesService.findById(data.ordenId)
      } catch {
        client.emit('tracking:error', { mensaje: `La orden #${data.ordenId} no existe` })
        return
      }

      if (orden.estado !== EstadoOrden.ENVIADA) {
        client.emit('tracking:error', {
          mensaje: `Solo se pueden rastrear órdenes en estado Enviada. La orden #${data.ordenId} está en estado ${orden.estado}`,
        })
        return
      }

      if (!orden.vehiculoId) {
        client.emit('tracking:error', {
          mensaje: `La orden #${data.ordenId} no tiene vehículo asignado`,
        })
        return
      }

      const room = `vehiculo-${orden.vehiculoId}`
      client.join(room)
      this.logger.log(`Cliente ${client.id} suscrito a ${room} para orden #${data.ordenId}`)

      const ultimaPos = await this.trackingService.findUltimoByVehiculo(orden.vehiculoId)
      if (ultimaPos) {
        client.emit('tracking:ubicacion', {
          vehiculoId: ultimaPos.vehiculoId,
          latitud: ultimaPos.latitud,
          longitud: ultimaPos.longitud,
          fechaHora: ultimaPos.fechaHora,
        })
      }
    } catch (error) {
      this.logger.error('Error al procesar tracking:suscribir', error)
      client.emit('tracking:error', { mensaje: 'Error interno al procesar la suscripción' })
    }
  }

  @SubscribeMessage('tracking:publicar')
  async handlePublicar(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: PublicarUbicacionDto,
  ): Promise<void> {
    try {
      if (
        !data ||
        typeof data.vehiculoId !== 'number' ||
        typeof data.latitud !== 'number' ||
        typeof data.longitud !== 'number'
      ) {
        client.emit('tracking:error', { mensaje: 'Datos de ubicación inválidos' })
        return
      }

      try {
        await this.vehiculosService.findById(data.vehiculoId)
      } catch {
        client.emit('tracking:error', {
          mensaje: `El vehículo con id ${data.vehiculoId} no existe`,
        })
        return
      }

      const geoLog = await this.trackingService.registrarUbicacion({
        vehiculoId: data.vehiculoId,
        latitud: data.latitud,
        longitud: data.longitud,
      })

      const payload = {
        vehiculoId: geoLog.vehiculoId,
        latitud: geoLog.latitud,
        longitud: geoLog.longitud,
        fechaHora: geoLog.fechaHora,
      }

      const room = `vehiculo-${data.vehiculoId}`
      this.server.to(room).emit('tracking:ubicacion', payload)
      this.logger.log(`Ubicación publicada y emitida a ${room}`)
    } catch (error) {
      this.logger.error('Error al procesar tracking:publicar', error)
      client.emit('tracking:error', { mensaje: 'Error interno al procesar la publicación' })
    }
  }
}
