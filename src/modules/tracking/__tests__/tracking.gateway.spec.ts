import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Server, Socket } from 'socket.io'
import { EstadoOrden, Orden } from '../../ordenes/entities/orden.entity'
import { OrdenesService } from '../../ordenes/services/ordenes.service'
import { VehiculosService } from '../../vehiculos/services/vehiculos.service'
import { GeoLog } from '../entities/geo-log.entity'
import { TrackingGateway } from '../gateways/tracking.gateway'
import { TrackingService } from '../services/tracking.service'

describe('TrackingGateway', () => {
  let gateway: TrackingGateway
  let trackingService: jest.Mocked<TrackingService>
  let ordenesService: jest.Mocked<OrdenesService>
  let vehiculosService: jest.Mocked<VehiculosService>
  let mockServer: {
    to: jest.Mock
  }
  let mockRoomEmitter: {
    emit: jest.Mock
  }
  let mockSocket: {
    id: string
    emit: jest.Mock
    join: jest.Mock
  }

  const mockGeoLog: GeoLog = {
    id: 1,
    vehiculoId: 5,
    latitud: -34.6037,
    longitud: -58.3816,
    fechaHora: new Date('2026-11-15T12:00:00Z'),
  }

  const mockOrdenEnviada: Orden = {
    id: 10,
    clienteNombre: 'Cliente Test',
    clienteDireccion: 'Calle 123',
    estado: EstadoOrden.ENVIADA,
    fechaCompletada: null,
    repartidorLegajo: 'REP-01',
    vehiculoId: 5,
    itemsPedidos: [],
  }

  beforeEach(async () => {
    mockRoomEmitter = {
      emit: jest.fn(),
    }
    mockServer = {
      to: jest.fn().mockReturnValue(mockRoomEmitter),
    }
    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      join: jest.fn(),
    }

    const mockTrackingService = {
      registrarUbicacion: jest.fn(),
      findUltimoByVehiculo: jest.fn(),
    }

    const mockOrdenesService = {
      findById: jest.fn(),
    }

    const mockVehiculosService = {
      findById: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingGateway,
        {
          provide: TrackingService,
          useValue: mockTrackingService,
        },
        {
          provide: OrdenesService,
          useValue: mockOrdenesService,
        },
        {
          provide: VehiculosService,
          useValue: mockVehiculosService,
        },
      ],
    }).compile()

    gateway = module.get<TrackingGateway>(TrackingGateway)
    trackingService = module.get(TrackingService)
    ordenesService = module.get(OrdenesService)
    vehiculosService = module.get(VehiculosService)

    gateway.server = mockServer as unknown as Server
  })

  describe('tracking:publicar', () => {
    it('vehículo existente → llama trackingService.registrarUbicacion y hace broadcast a la room del vehículo', async () => {
      vehiculosService.findById.mockResolvedValue({
        id: 5,
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      })
      trackingService.registrarUbicacion.mockResolvedValue(mockGeoLog)

      await gateway.handlePublicar(mockSocket as unknown as Socket, {
        vehiculoId: 5,
        latitud: -34.6037,
        longitud: -58.3816,
      })

      expect(vehiculosService.findById).toHaveBeenCalledWith(5)
      expect(trackingService.registrarUbicacion).toHaveBeenCalledWith({
        vehiculoId: 5,
        latitud: -34.6037,
        longitud: -58.3816,
      })
      expect(mockServer.to).toHaveBeenCalledWith('vehiculo-5')
      expect(mockRoomEmitter.emit).toHaveBeenCalledWith('tracking:ubicacion', {
        vehiculoId: mockGeoLog.vehiculoId,
        latitud: mockGeoLog.latitud,
        longitud: mockGeoLog.longitud,
        fechaHora: mockGeoLog.fechaHora,
      })
    })

    it('vehículo inexistente → emite tracking:error al socket, NO persiste log', async () => {
      vehiculosService.findById.mockRejectedValue(
        new NotFoundException('El vehículo con id 999 no fue encontrado'),
      )

      await gateway.handlePublicar(mockSocket as unknown as Socket, {
        vehiculoId: 999,
        latitud: -34.6037,
        longitud: -58.3816,
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('tracking:error', {
        mensaje: 'El vehículo con id 999 no existe',
      })
      expect(trackingService.registrarUbicacion).not.toHaveBeenCalled()
      expect(mockServer.to).not.toHaveBeenCalled()
    })

    it('datos inválidos → emite tracking:error al socket', async () => {
      await gateway.handlePublicar(mockSocket as unknown as Socket, {
        vehiculoId: 'invalid' as any,
        latitud: -34.6037,
        longitud: -58.3816,
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('tracking:error', {
        mensaje: 'Datos de ubicación inválidos',
      })
      expect(trackingService.registrarUbicacion).not.toHaveBeenCalled()
    })
  })

  describe('tracking:suscribir', () => {
    it('orden Enviada con historial → socket se une a vehiculo-{id} y recibe tracking:ubicacion con la última posición', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenEnviada)
      trackingService.findUltimoByVehiculo.mockResolvedValue(mockGeoLog)

      await gateway.handleSuscribir(mockSocket as unknown as Socket, { ordenId: 10 })

      expect(ordenesService.findById).toHaveBeenCalledWith(10)
      expect(mockSocket.join).toHaveBeenCalledWith('vehiculo-5')
      expect(trackingService.findUltimoByVehiculo).toHaveBeenCalledWith(5)
      expect(mockSocket.emit).toHaveBeenCalledWith('tracking:ubicacion', {
        vehiculoId: mockGeoLog.vehiculoId,
        latitud: mockGeoLog.latitud,
        longitud: mockGeoLog.longitud,
        fechaHora: mockGeoLog.fechaHora,
      })
    })

    it('orden Enviada sin historial previo → socket se une a la room, no emite posición inicial', async () => {
      ordenesService.findById.mockResolvedValue(mockOrdenEnviada)
      trackingService.findUltimoByVehiculo.mockResolvedValue(null)

      await gateway.handleSuscribir(mockSocket as unknown as Socket, { ordenId: 10 })

      expect(mockSocket.join).toHaveBeenCalledWith('vehiculo-5')
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('orden inexistente → emite tracking:error, socket no se une a ninguna room', async () => {
      ordenesService.findById.mockRejectedValue(new NotFoundException('Orden no encontrada'))

      await gateway.handleSuscribir(mockSocket as unknown as Socket, { ordenId: 999 })

      expect(mockSocket.emit).toHaveBeenCalledWith('tracking:error', {
        mensaje: 'La orden #999 no existe',
      })
      expect(mockSocket.join).not.toHaveBeenCalled()
    })

    it.each([EstadoOrden.PEDIDA, EstadoOrden.LISTA, EstadoOrden.COMPLETADA])(
      'orden en estado %s → emite tracking:error',
      async (estado) => {
        ordenesService.findById.mockResolvedValue({
          ...mockOrdenEnviada,
          estado,
        })

        await gateway.handleSuscribir(mockSocket as unknown as Socket, { ordenId: 10 })

        expect(mockSocket.emit).toHaveBeenCalledWith('tracking:error', {
          mensaje: expect.stringContaining(`Solo se pueden rastrear órdenes en estado Enviada`),
        })
        expect(mockSocket.join).not.toHaveBeenCalled()
      },
    )

    it('datos de suscripción inválidos → emite tracking:error', async () => {
      await gateway.handleSuscribir(mockSocket as unknown as Socket, { ordenId: 'abc' as any })

      expect(mockSocket.emit).toHaveBeenCalledWith('tracking:error', {
        mensaje: 'Datos de suscripción inválidos',
      })
      expect(mockSocket.join).not.toHaveBeenCalled()
    })
  })
})
