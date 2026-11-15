import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { InventarioService } from '../services/inventario.service'

@ApiTags('Inventario')
@Controller(['inventario', 'items'])
export class InventarioController {
  private readonly logger = new Logger(InventarioController.name)

  constructor(private readonly inventarioService: InventarioService) {}

  @Get(['items/estado', 'estado', 'items', ''])
  @ApiOperation({
    summary: 'Consultar el estado de los items físicos agrupados por SKU',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de SKUs con cantidad de items disponibles y reservados',
    type: [EstadoItemsDto],
  })
  async obtenerEstadoItems(): Promise<EstadoItemsDto[]> {
    try {
      return await this.inventarioService.obtenerEstadoItems()
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error('Error inesperado al consultar estado de los items', error)
      throw new InternalServerErrorException('Error al recuperar el estado de los items')
    }
  }
}
