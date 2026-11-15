import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CreateVehiculoDto } from '../dto/create-vehiculo.dto'
import { Vehiculo } from '../entities/vehiculo.entity'
import { VehiculosService } from '../services/vehiculos.service'

@ApiTags('Vehiculos')
@Controller('vehiculos')
export class VehiculosController {
  private readonly logger = new Logger(VehiculosController.name)

  constructor(private readonly vehiculosService: VehiculosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los vehículos registrados' })
  @ApiResponse({
    status: 200,
    description: 'Listado de vehículos obtenido exitosamente',
    type: [Vehiculo],
  })
  async findAll(): Promise<Vehiculo[]> {
    try {
      return await this.vehiculosService.findAll()
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al listar los vehículos', error)
      throw new InternalServerErrorException('Error al recuperar el listado de vehículos')
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un vehículo por su identificador' })
  @ApiParam({ name: 'id', description: 'ID numérico del vehículo', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Vehículo encontrado exitosamente',
    type: Vehiculo,
  })
  @ApiResponse({ status: 400, description: 'Identificador provisto inválido' })
  @ApiResponse({ status: 404, description: 'El vehículo no existe' })
  async findById(@Param('id', ParseIntPipe) id: number): Promise<Vehiculo> {
    try {
      return await this.vehiculosService.findById(id)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error(`Error inesperado al buscar el vehículo #${id}`, error)
      throw new InternalServerErrorException('Error al recuperar el vehículo solicitado')
    }
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo vehículo de transporte' })
  @ApiBody({ type: CreateVehiculoDto })
  @ApiResponse({
    status: 201,
    description: 'Vehículo registrado exitosamente',
    type: Vehiculo,
  })
  @ApiResponse({
    status: 400,
    description: 'Cuerpo de petición inválido o faltan datos obligatorios',
  })
  async create(@Body() createVehiculoDto: CreateVehiculoDto): Promise<Vehiculo> {
    try {
      if (
        !createVehiculoDto ||
        !createVehiculoDto.modelo ||
        createVehiculoDto.capacidadVolumen == null ||
        createVehiculoDto.capacidadPeso == null ||
        createVehiculoDto.capacidadVolumen <= 0 ||
        createVehiculoDto.capacidadPeso <= 0
      ) {
        throw new BadRequestException('Los datos del vehículo son inválidos')
      }

      return await this.vehiculosService.create(createVehiculoDto)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al registrar el vehículo', error)
      throw new InternalServerErrorException('No se pudo procesar el registro del vehículo')
    }
  }
}
