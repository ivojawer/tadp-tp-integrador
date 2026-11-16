import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { InventarioService } from '../services/inventario.service'

@ApiTags('Inventario', 'Items')
@Controller('items')
export class InventarioController {
  private readonly logger = new Logger(InventarioController.name)

  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consultar el estado de los items físicos agrupados por SKU con paginación (pageSize/offset)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de SKUs con cantidad de items disponibles y reservados',
    type: PaginatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Parámetros de consulta inválidos' })
  async obtenerEstadoItems(
    @Query() query?: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<EstadoItemsDto>> {
    try {
      return await this.inventarioService.obtenerEstadoItems(query)
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al consultar estado de los items', error)
      throw new InternalServerErrorException('Error al recuperar el estado de los items')
    }
  }
}
