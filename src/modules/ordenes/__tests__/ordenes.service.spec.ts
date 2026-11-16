import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { IItemsRepository, ITEMS_REPOSITORY } from '../../inventario/repositories/items.repository'
import { EstadoFisicoItem } from '../../inventario/entities/item.entity'
import { VehiculosService } from '../../vehiculos/services/vehiculos.service'
import { EstadoOrden, Orden } from '../entities/orden.entity'
import { IOrdenesRepository, ORDENES_REPOSITORY } from '../repositories/ordenes.repository'
import { OrdenesService } from '../services/ordenes.service'

describe('OrdenesService', () => {
  let service: OrdenesService
  let repository: jest.Mocked<IOrdenesRepository>
  let itemsRepository: jest.Mocked<IItemsRepository>
  let vehiculosService: jest.Mocked<Pick<VehiculosService, 'findById'>>

  const mockOrdenBase: Orden = {
    id: 1,
    clienteNombre: 'Juan Pérez',
    clienteDireccion: 'Calle 123',
    estado: EstadoOrden.PEDIDA,
    fechaCompletada: null,
    repartidorLegajo: null,
    vehiculoId: null,
    itemsPedidos: [
      {
        id: 1,
        productoSku: 'SKU-01',
        cantidad: 2,
        items: [
          {
            id: 101,
            productoSku: 'SKU-01',
            estadoFisico: EstadoFisicoItem.RESERVADO,
            ordenId: 1,
          },
          {
            id: 102,
            productoSku: 'SKU-01',
            estadoFisico: EstadoFisicoItem.RESERVADO,
            ordenId: 1,
          },
        ],
      },
    ],
  }

  beforeEach(async () => {
    const mockRepo: jest.Mocked<IOrdenesRepository> = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      updateEstado: jest
        .fn()
        .mockImplementation(async (id, nuevoEstado, options, onTransaction) => {
          if (onTransaction) {
            await onTransaction(id, {} as any)
          }
          return {
            ...mockOrdenBase,
            id,
            estado: nuevoEstado,
            fechaCompletada: options?.fechaCompletada ?? null,
            repartidorLegajo: options?.repartidorLegajo ?? null,
            vehiculoId: options?.vehiculoId ?? null,
          }
        }),
    }

    const mockItemsRepo: jest.Mocked<IItemsRepository> = {
      crearItem: jest.fn(),
      countDisponibles: jest.fn(),
      reservar: jest.fn(),
      prepararPorOrden: jest.fn(),
      entregarPorOrden: jest.fn(),
      findByOrden: jest.fn(),
      obtenerEstadoItems: jest.fn(),
    }

    const mockVehiculosService = {
      findById: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesService,
        {
          provide: ORDENES_REPOSITORY,
          useValue: mockRepo,
        },
        {
          provide: ITEMS_REPOSITORY,
          useValue: mockItemsRepo,
        },
        {
          provide: VehiculosService,
          useValue: mockVehiculosService,
        },
      ],
    }).compile()

    service = module.get<OrdenesService>(OrdenesService)
    repository = module.get(ORDENES_REPOSITORY)
    itemsRepository = module.get(ITEMS_REPOSITORY)
    vehiculosService = module.get(VehiculosService)
  })

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined()
  })

  describe('findById', () => {
    it('debe retornar la orden si existe', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      const result = await service.findById(1)
      expect(result).toEqual(mockOrdenBase)
      expect(repository.findById).toHaveBeenCalledWith(1)
    })

    it('retorna la orden con sus itemsPedidos mapeados', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      const result = await service.findById(1)
      expect(result.itemsPedidos).toHaveLength(1)
      expect(result.itemsPedidos[0].productoSku).toBe('SKU-01')
      expect(result.itemsPedidos[0].items).toHaveLength(2)
      expect(result.itemsPedidos[0].items[0].estadoFisico).toBe(EstadoFisicoItem.RESERVADO)
    })

    it('debe lanzar NotFoundException si la orden no existe', async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    it('debe crear y retornar una orden con estado Pedida', async () => {
      itemsRepository.countDisponibles.mockResolvedValue(5)
      repository.create.mockResolvedValue(mockOrdenBase)

      const result = await service.create({
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Calle 123',
        items: [{ productoSku: 'SKU-01', cantidad: 2 }],
      })

      expect(result.estado).toBe(EstadoOrden.PEDIDA)
      expect(repository.create).toHaveBeenCalled()
    })

    it('retorna orden con itemsPedidos iniciales sin items físicos', async () => {
      const ordenRecienCreada: Orden = {
        ...mockOrdenBase,
        itemsPedidos: [
          {
            id: 1,
            productoSku: 'SKU-01',
            cantidad: 2,
            items: [],
          },
        ],
      }
      itemsRepository.countDisponibles.mockResolvedValue(5)
      repository.create.mockResolvedValue(ordenRecienCreada)

      const result = await service.create({
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Calle 123',
        items: [{ productoSku: 'SKU-01', cantidad: 2 }],
      })

      expect(result.itemsPedidos).toBeDefined()
      expect(result.itemsPedidos).toHaveLength(1)
      expect(result.itemsPedidos[0].productoSku).toBe('SKU-01')
      expect(result.itemsPedidos[0].cantidad).toBe(2)
      expect(result.itemsPedidos[0].items).toEqual([])
    })

    // --- T3 tests ---

    it('create con stock suficiente → llama reservar para cada sku y retorna la orden', async () => {
      itemsRepository.countDisponibles.mockResolvedValue(10)
      // repository.create ejecuta el callback onTransaction internamente;
      // en el mock simplemente lo ignoramos y retornamos la orden
      repository.create.mockImplementation(async (_data, onTransaction) => {
        if (onTransaction) await onTransaction(mockOrdenBase.id, {} as any)
        return mockOrdenBase
      })
      itemsRepository.reservar.mockResolvedValue(undefined)

      const result = await service.create({
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Calle 123',
        items: [{ productoSku: 'SKU-01', cantidad: 2 }],
      })

      expect(itemsRepository.reservar).toHaveBeenCalledWith('SKU-01', 2, mockOrdenBase.id, {})
      expect(result).toEqual(mockOrdenBase)
    })

    it('create cuando un sku no tiene stock suficiente → lanza ConflictException con el sku', async () => {
      itemsRepository.countDisponibles.mockResolvedValue(1)

      await expect(
        service.create({
          clienteNombre: 'Juan Pérez',
          clienteDireccion: 'Calle 123',
          items: [{ productoSku: 'SKU-FALTANTE', cantidad: 3 }],
        }),
      ).rejects.toThrow(ConflictException)

      await expect(
        service.create({
          clienteNombre: 'Juan Pérez',
          clienteDireccion: 'Calle 123',
          items: [{ productoSku: 'SKU-FALTANTE', cantidad: 3 }],
        }),
      ).rejects.toThrow(/SKU-FALTANTE/)
    })

    it('create con múltiples items y el primero alcanza pero el segundo no → no reserva ninguno', async () => {
      // SKU-01 tiene stock, SKU-02 no
      itemsRepository.countDisponibles
        .mockResolvedValueOnce(5) // SKU-01 OK
        .mockResolvedValueOnce(0) // SKU-02 sin stock

      await expect(
        service.create({
          clienteNombre: 'Juan Pérez',
          clienteDireccion: 'Calle 123',
          items: [
            { productoSku: 'SKU-01', cantidad: 2 },
            { productoSku: 'SKU-02', cantidad: 1 },
          ],
        }),
      ).rejects.toThrow(ConflictException)

      // reservar no debe haberse llamado en absoluto
      expect(itemsRepository.reservar).not.toHaveBeenCalled()
      // la orden tampoco debe haberse creado
      expect(repository.create).not.toHaveBeenCalled()
    })

    it('create → countDisponibles se llama una vez por sku distinto en el dto', async () => {
      itemsRepository.countDisponibles.mockResolvedValue(10)
      repository.create.mockImplementation(async (_data, onTransaction) => {
        if (onTransaction) await onTransaction(mockOrdenBase.id, {} as any)
        return mockOrdenBase
      })
      itemsRepository.reservar.mockResolvedValue(undefined)

      await service.create({
        clienteNombre: 'Juan Pérez',
        clienteDireccion: 'Calle 123',
        items: [
          { productoSku: 'SKU-A', cantidad: 1 },
          { productoSku: 'SKU-B', cantidad: 2 },
        ],
      })

      expect(itemsRepository.countDisponibles).toHaveBeenCalledTimes(2)
      expect(itemsRepository.countDisponibles).toHaveBeenCalledWith('SKU-A')
      expect(itemsRepository.countDisponibles).toHaveBeenCalledWith('SKU-B')
    })
  })

  describe('cambiarEstado', () => {
    it('debe permitir transición válida de Pedida a Lista', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.LISTA,
      })

      expect(result.estado).toBe(EstadoOrden.LISTA)
    })

    // --- T4 tests ---

    it('cambiarEstado Pedida → Lista → llama prepararPorOrden(ordenId) exactamente una vez', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.LISTA,
      })

      expect(result.estado).toBe(EstadoOrden.LISTA)
      expect(itemsRepository.prepararPorOrden).toHaveBeenCalledTimes(1)
      expect(itemsRepository.prepararPorOrden).toHaveBeenCalledWith(1, expect.anything())
      expect(itemsRepository.entregarPorOrden).not.toHaveBeenCalled()
    })

    it('cambiarEstado Lista → Enviada → NO llama ni a prepararPorOrden ni a entregarPorOrden', async () => {
      const ordenLista: Orden = {
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      }
      repository.findById.mockResolvedValue(ordenLista)

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-01',
        vehiculoId: 10,
      })

      expect(result.estado).toBe(EstadoOrden.ENVIADA)
      expect(itemsRepository.prepararPorOrden).not.toHaveBeenCalled()
      expect(itemsRepository.entregarPorOrden).not.toHaveBeenCalled()
    })

    it('cambiarEstado Enviada → Completada → llama entregarPorOrden(ordenId) exactamente una vez, retorna orden con fechaCompletada seteada', async () => {
      const ordenEnviada: Orden = {
        ...mockOrdenBase,
        estado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-01',
        vehiculoId: 10,
      }
      repository.findById.mockResolvedValue(ordenEnviada)

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.COMPLETADA,
      })

      expect(result.estado).toBe(EstadoOrden.COMPLETADA)
      expect(itemsRepository.entregarPorOrden).toHaveBeenCalledTimes(1)
      expect(itemsRepository.entregarPorOrden).toHaveBeenCalledWith(1, expect.anything())
      expect(itemsRepository.prepararPorOrden).not.toHaveBeenCalled()
      expect(result.fechaCompletada).toBeInstanceOf(Date)
    })

    it('cambiarEstado falla en prepararPorOrden → la orden NO cambia de estado (rollback)', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)
      itemsRepository.prepararPorOrden.mockRejectedValue(
        new Error('Fallo en base de datos al preparar items'),
      )

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.LISTA,
        }),
      ).rejects.toThrow('Fallo en base de datos al preparar items')

      expect(itemsRepository.prepararPorOrden).toHaveBeenCalledTimes(1)
    })

    it('debe rechazar transición directa de Pedida a Enviada', async () => {
      repository.findById.mockResolvedValue(mockOrdenBase)

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('debe exigir repartidor y vehículo para pasar a Enviada', async () => {
      repository.findById.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      })

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('debe rechazar transición si ya está completada', async () => {
      repository.findById.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.COMPLETADA,
      })

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.LISTA,
        }),
      ).rejects.toThrow(ConflictException)
    })

    // --- T6 tests ---

    it('cambiarEstado Lista → Enviada con vehiculoId válido → llama vehiculosService.findById, actualiza estado', async () => {
      const ordenLista: Orden = {
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      }
      repository.findById.mockResolvedValue(ordenLista)
      vehiculosService.findById.mockResolvedValue({
        id: 10,
        modelo: 'Fiat Ducato',
        capacidadVolumen: 10,
        capacidadPeso: 500,
      } as any)

      const result = await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.ENVIADA,
        repartidorLegajo: 'REP-01',
        vehiculoId: 10,
      })

      expect(vehiculosService.findById).toHaveBeenCalledWith(10)
      expect(result.estado).toBe(EstadoOrden.ENVIADA)
    })

    it('cambiarEstado Lista → Enviada sin vehiculoId → lanza BadRequestException', async () => {
      repository.findById.mockResolvedValue({
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      })

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
          repartidorLegajo: 'REP-01',
        }),
      ).rejects.toThrow(BadRequestException)

      expect(vehiculosService.findById).not.toHaveBeenCalled()
    })

    it('cambiarEstado Lista → Enviada con vehiculoId inexistente → lanza NotFoundException', async () => {
      const ordenLista: Orden = {
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      }
      repository.findById.mockResolvedValue(ordenLista)
      vehiculosService.findById.mockRejectedValue(
        new NotFoundException('El vehículo con id 999 no fue encontrado'),
      )

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.ENVIADA,
          repartidorLegajo: 'REP-01',
          vehiculoId: 999,
        }),
      ).rejects.toThrow(NotFoundException)

      expect(vehiculosService.findById).toHaveBeenCalledWith(999)
    })
  })

  describe('findAll', () => {
    const mockPaginated: PaginatedResponseDto<Orden> = {
      data: [mockOrdenBase],
      offset: 0,
      pageSize: 10,
      hasNextPage: false,
    }

    it('sin filtro llama al repository y retorna respuesta paginada', async () => {
      repository.findAll.mockResolvedValue(mockPaginated)

      const result = await service.findAll()

      expect(repository.findAll).toHaveBeenCalledWith(undefined)
      expect(result).toEqual(mockPaginated)
    })

    it('con estado=Lista pasa el filtro al repository', async () => {
      const mockOrdenLista: Orden = {
        ...mockOrdenBase,
        estado: EstadoOrden.LISTA,
      }
      const mockPaginatedLista: PaginatedResponseDto<Orden> = {
        data: [mockOrdenLista],
        offset: 0,
        pageSize: 10,
        hasNextPage: false,
      }
      repository.findAll.mockResolvedValue(mockPaginatedLista)

      const result = await service.findAll({ estado: EstadoOrden.LISTA })

      expect(repository.findAll).toHaveBeenCalledWith({ estado: EstadoOrden.LISTA })
      expect(result).toEqual(mockPaginatedLista)
    })

    it('con paginación pageSize y offset pasa los parámetros al repository', async () => {
      const mockPaginatedCustom: PaginatedResponseDto<Orden> = {
        data: [mockOrdenBase],
        offset: 10,
        pageSize: 5,
        hasNextPage: true,
      }
      repository.findAll.mockResolvedValue(mockPaginatedCustom)

      const filtros = { pageSize: 5, offset: 10 }
      const result = await service.findAll(filtros)

      expect(repository.findAll).toHaveBeenCalledWith(filtros)
      expect(result).toEqual(mockPaginatedCustom)
      expect(result.hasNextPage).toBe(true)
    })

    it('con estado y paginación combina todos los filtros hacia el repository', async () => {
      repository.findAll.mockResolvedValue(mockPaginated)

      const filtros = { estado: EstadoOrden.PEDIDA, pageSize: 2, offset: 4 }
      const result = await service.findAll(filtros)

      expect(repository.findAll).toHaveBeenCalledWith(filtros)
      expect(result).toEqual(mockPaginated)
    })

    it('retorna data vacía cuando no hay órdenes', async () => {
      const mockEmpty: PaginatedResponseDto<Orden> = {
        data: [],
        offset: 0,
        pageSize: 10,
        hasNextPage: false,
      }
      repository.findAll.mockResolvedValue(mockEmpty)

      const result = await service.findAll()

      expect(result).toEqual(mockEmpty)
      expect(result.data).toEqual([])
    })
  })
})
