import { Inject, Injectable, Logger } from '@nestjs/common'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { IItemsRepository, ITEMS_REPOSITORY } from '../repositories/items.repository'

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name)

  constructor(
    @Inject(ITEMS_REPOSITORY)
    private readonly itemsRepository: IItemsRepository,
  ) {}

  async obtenerEstadoItems(): Promise<EstadoItemsDto[]> {
    this.logger.log('Consultando estado de stock de los items en almacén')
    return await this.itemsRepository.obtenerEstadoItems()
  }
}
