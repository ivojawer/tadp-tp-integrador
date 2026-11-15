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
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CreateOrdenDto } from '../dto/create-orden.dto'
import { FindOrdenesQueryDto } from '../dto/find-ordenes-query.dto'
import { UpdateEstadoOrdenDto } from '../dto/update-estado-orden.dto'
import { Orden } from '../entities/orden.entity'
import { OrdenesService } from '../services/ordenes.service'

@ApiTags('Ordenes')
@Controller('ordenes')
export class OrdenesController {
  private readonly logger = new Logger(OrdenesController.name)

  constructor(private readonly ordenesService: OrdenesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar órdenes con filtro opcional por estado' })
  @ApiResponse({
    status: 200,
    description: 'Listado de órdenes obtenido exitosamente con sus líneas de pedido',
    type: [Orden],
  })
  @ApiResponse({ status: 400, description: 'Parámetros de consulta inválidos' })
  async findAll(@Query() query?: FindOrdenesQueryDto): Promise<Orden[]> {
    try {
      const filtros = query && Object.keys(query).length > 0 ? query : undefined
      return await (filtros ? this.ordenesService.findAll(filtros) : this.ordenesService.findAll())
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al listar las órdenes', error)
      throw new InternalServerErrorException('Error al recuperar el listado de órdenes')
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una orden por su identificador' })
  @ApiParam({ name: 'id', description: 'ID numérico de la orden', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Orden encontrada con éxito con sus líneas de pedido e items físicos',
    type: Orden,
  })
  @ApiResponse({ status: 400, description: 'Identificador provisto inválido' })
  @ApiResponse({ status: 404, description: 'La orden no existe' })
  async findById(@Param('id', ParseIntPipe) id: number): Promise<Orden> {
    try {
      return await this.ordenesService.findById(id)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error(`Error inesperado al buscar la orden #${id}`, error)
      throw new InternalServerErrorException('Error al recuperar la orden solicitada')
    }
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva orden de pedido' })
  @ApiBody({ type: CreateOrdenDto })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: Orden })
  @ApiResponse({
    status: 400,
    description: 'Cuerpo de petición inválido o faltan datos obligatorios',
  })
  async create(@Body() createOrdenDto: CreateOrdenDto): Promise<Orden> {
    try {
      // Validación contextual adicional de request
      if (!createOrdenDto.items || createOrdenDto.items.length === 0) {
        throw new BadRequestException('La orden debe contener al menos un item pedido')
      }

      return await this.ordenesService.create(createOrdenDto)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al crear la orden', error)
      throw new InternalServerErrorException('No se pudo procesar la creación de la orden')
    }
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Actualizar el estado logístico de una orden' })
  @ApiParam({ name: 'id', description: 'ID numérico de la orden', example: 1 })
  @ApiBody({ type: UpdateEstadoOrdenDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado correctamente', type: Orden })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida o faltan parámetros' })
  @ApiResponse({ status: 404, description: 'La orden no existe' })
  @ApiResponse({ status: 409, description: 'Conflicto con el estado actual de la orden' })
  async cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEstadoOrdenDto,
  ): Promise<Orden> {
    try {
      return await this.ordenesService.cambiarEstado(id, updateDto)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error(`Error inesperado al actualizar estado de la orden #${id}`, error)
      throw new InternalServerErrorException('No se pudo actualizar el estado de la orden')
    }
  }
}
