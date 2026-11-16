import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { IItemsRepository, ITEMS_REPOSITORY } from '../../inventario/repositories/items.repository'
import { VehiculosService } from '../../vehiculos/services/vehiculos.service'
import { CreateOrdenDto } from '../dto/create-orden.dto'
import { FindOrdenesQueryDto } from '../dto/find-ordenes-query.dto'
import { UpdateEstadoOrdenDto } from '../dto/update-estado-orden.dto'
import { EstadoOrden, Orden } from '../entities/orden.entity'
import { IOrdenesRepository, ORDENES_REPOSITORY } from '../repositories/ordenes.repository'

@Injectable()
export class OrdenesService {
  private readonly logger = new Logger(OrdenesService.name)

  constructor(
    @Inject(ORDENES_REPOSITORY)
    private readonly ordenesRepository: IOrdenesRepository,
    @Inject(ITEMS_REPOSITORY)
    private readonly itemsRepository: IItemsRepository,
    private readonly vehiculosService: VehiculosService,
  ) {}

  async findById(id: number): Promise<Orden> {
    const orden = await this.ordenesRepository.findById(id)
    if (!orden) {
      throw new NotFoundException(`La orden con id ${id} no fue encontrada`)
    }
    return orden
  }

  async findAll(filtros?: FindOrdenesQueryDto): Promise<PaginatedResponseDto<Orden>> {
    const pageSize = filtros?.pageSize ?? 10
    const offset = filtros?.offset ?? 0
    this.logger.log(
      `Listando órdenes${filtros?.estado ? ` con filtro estado=${filtros.estado}` : ''} pageSize=${pageSize} offset=${offset}`,
    )
    return await this.ordenesRepository.findAll(filtros)
  }

  async create(createOrdenDto: CreateOrdenDto): Promise<Orden> {
    this.logger.log(`Creando nueva orden para cliente: ${createOrdenDto.clienteNombre}`)

    // Verificar stock disponible para todos los items antes de crear la orden
    for (const item of createOrdenDto.items) {
      const disponibles = await this.itemsRepository.countDisponibles(item.productoSku)
      if (disponibles < item.cantidad) {
        throw new ConflictException(
          `Stock insuficiente para el producto '${item.productoSku}': se requieren ${item.cantidad} pero hay ${disponibles} disponibles`,
        )
      }
    }

    const orden = await this.ordenesRepository.create(
      {
        clienteNombre: createOrdenDto.clienteNombre,
        clienteDireccion: createOrdenDto.clienteDireccion,
        items: createOrdenDto.items,
      },
      async (ordenId, trx) => {
        for (const item of createOrdenDto.items) {
          await this.itemsRepository.reservar(item.productoSku, item.cantidad, ordenId, trx)
        }
      },
    )

    this.logger.log(`Orden #${orden.id} creada exitosamente con estado ${orden.estado}`)
    return orden
  }

  async cambiarEstado(id: number, updateDto: UpdateEstadoOrdenDto): Promise<Orden> {
    const ordenActual = await this.findById(id)
    this.validarTransicionEstado(ordenActual, updateDto)

    if (
      ordenActual.estado === EstadoOrden.LISTA &&
      updateDto.nuevoEstado === EstadoOrden.ENVIADA &&
      updateDto.vehiculoId
    ) {
      await this.vehiculosService.findById(updateDto.vehiculoId)
    }

    const options = {
      repartidorLegajo: updateDto.repartidorLegajo ?? ordenActual.repartidorLegajo ?? undefined,
      vehiculoId: updateDto.vehiculoId ?? ordenActual.vehiculoId ?? undefined,
      fechaCompletada: updateDto.nuevoEstado === EstadoOrden.COMPLETADA ? new Date() : undefined,
    }

    const ordenActualizada = await this.ordenesRepository.updateEstado(
      id,
      updateDto.nuevoEstado,
      options,
      async (ordenId, trx) => {
        if (
          ordenActual.estado === EstadoOrden.PEDIDA &&
          updateDto.nuevoEstado === EstadoOrden.LISTA
        ) {
          await this.itemsRepository.prepararPorOrden(ordenId, trx)
        } else if (
          ordenActual.estado === EstadoOrden.ENVIADA &&
          updateDto.nuevoEstado === EstadoOrden.COMPLETADA
        ) {
          await this.itemsRepository.entregarPorOrden(ordenId, trx)
        }
      },
    )

    this.logger.log(
      `Orden #${id} cambió de estado de ${ordenActual.estado} a ${ordenActualizada.estado}`,
    )
    return ordenActualizada
  }

  private validarTransicionEstado(ordenActual: Orden, updateDto: UpdateEstadoOrdenDto): void {
    const { estado } = ordenActual
    const { nuevoEstado, repartidorLegajo, vehiculoId } = updateDto

    if (estado === nuevoEstado) {
      throw new ConflictException(`La orden ya se encuentra en estado ${nuevoEstado}`)
    }

    if (estado === EstadoOrden.COMPLETADA) {
      throw new ConflictException('No se puede cambiar el estado de una orden ya completada')
    }

    // Reglas de transición de la máquina de estados
    switch (estado) {
      case EstadoOrden.PEDIDA:
        if (nuevoEstado !== EstadoOrden.LISTA) {
          throw new BadRequestException(
            `Transición inválida: una orden en estado Pedida solo puede pasar a Lista`,
          )
        }
        break

      case EstadoOrden.LISTA:
        if (nuevoEstado !== EstadoOrden.ENVIADA) {
          throw new BadRequestException(
            `Transición inválida: una orden en estado Lista solo puede pasar a Enviada`,
          )
        }
        if (!repartidorLegajo || !vehiculoId) {
          throw new BadRequestException(
            'Para pasar a estado Enviada se requiere asignar repartidorLegajo y vehiculoId',
          )
        }
        break

      case EstadoOrden.ENVIADA:
        if (nuevoEstado !== EstadoOrden.COMPLETADA) {
          throw new BadRequestException(
            `Transición inválida: una orden en estado Enviada solo puede pasar a Completada`,
          )
        }
        break
    }
  }
}
