import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { CreateOrdenDto } from '../dto/create-orden.dto'
import { UpdateEstadoOrdenDto } from '../dto/update-estado-orden.dto'
import { EstadoOrden, Orden } from '../entities/orden.entity'
import { IOrdenesRepository, ORDENES_REPOSITORY } from '../repositories/ordenes.repository'

@Injectable()
export class OrdenesService {
  private readonly logger = new Logger(OrdenesService.name)

  constructor(
    @Inject(ORDENES_REPOSITORY)
    private readonly ordenesRepository: IOrdenesRepository,
  ) {}

  async findById(id: number): Promise<Orden> {
    const orden = await this.ordenesRepository.findById(id)
    if (!orden) {
      throw new NotFoundException(`La orden con id ${id} no fue encontrada`)
    }
    return orden
  }

  async create(createOrdenDto: CreateOrdenDto): Promise<Orden> {
    this.logger.log(`Creando nueva orden para cliente: ${createOrdenDto.clienteNombre}`)

    const orden = await this.ordenesRepository.create({
      clienteNombre: createOrdenDto.clienteNombre,
      clienteDireccion: createOrdenDto.clienteDireccion,
      items: createOrdenDto.items,
    })

    this.logger.log(`Orden #${orden.id} creada exitosamente con estado ${orden.estado}`)
    return orden
  }

  async cambiarEstado(id: number, updateDto: UpdateEstadoOrdenDto): Promise<Orden> {
    const ordenActual = await this.findById(id)
    this.validarTransicionEstado(ordenActual, updateDto)

    const options = {
      repartidorLegajo: updateDto.repartidorLegajo ?? ordenActual.repartidorLegajo ?? undefined,
      vehiculoId: updateDto.vehiculoId ?? ordenActual.vehiculoId ?? undefined,
      fechaCompletada: updateDto.nuevoEstado === EstadoOrden.COMPLETADA ? new Date() : undefined,
    }

    const ordenActualizada = await this.ordenesRepository.updateEstado(
      id,
      updateDto.nuevoEstado,
      options,
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
