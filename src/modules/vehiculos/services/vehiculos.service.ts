import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CreateVehiculoDto } from '../dto/create-vehiculo.dto'
import { Vehiculo } from '../entities/vehiculo.entity'
import { IVehiculosRepository, VEHICULOS_REPOSITORY } from '../repositories/vehiculos.repository'

@Injectable()
export class VehiculosService {
  private readonly logger = new Logger(VehiculosService.name)

  constructor(
    @Inject(VEHICULOS_REPOSITORY)
    private readonly vehiculosRepository: IVehiculosRepository,
  ) {}

  async findAll(): Promise<Vehiculo[]> {
    this.logger.log('Listando todos los vehículos')
    return await this.vehiculosRepository.findAll()
  }

  async findById(id: number): Promise<Vehiculo> {
    this.logger.log(`Buscando vehículo con id: ${id}`)
    const vehiculo = await this.vehiculosRepository.findById(id)
    if (!vehiculo) {
      throw new NotFoundException(`El vehículo con id ${id} no fue encontrado`)
    }
    return vehiculo
  }

  async create(dto: CreateVehiculoDto): Promise<Vehiculo> {
    this.logger.log(`Creando nuevo vehículo modelo: ${dto.modelo}`)
    return await this.vehiculosRepository.create({
      modelo: dto.modelo,
      capacidadVolumen: dto.capacidadVolumen,
      capacidadPeso: dto.capacidadPeso,
    })
  }
}
