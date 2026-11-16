import { Inject, Injectable, Logger } from '@nestjs/common'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { IItemsRepository, ITEMS_REPOSITORY } from '../repositories/items.repository'

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name)

  constructor(
    @Inject(ITEMS_REPOSITORY)
    private readonly itemsRepository: IItemsRepository,
  ) {}

  async obtenerEstadoItems(
    pagination?: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<EstadoItemsDto>> {
    const pageSize = pagination?.pageSize ?? 10
    const offset = pagination?.offset ?? 0
    this.logger.log(
      `Consultando estado de stock de los items en almacén pageSize=${pageSize} offset=${offset}`,
    )
    return await this.itemsRepository.obtenerEstadoItems(pagination)
  }
}
