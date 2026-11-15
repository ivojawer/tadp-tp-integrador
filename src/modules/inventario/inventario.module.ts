import { Module } from '@nestjs/common'
import { InventarioController } from './controllers/inventario.controller'
import { ITEMS_REPOSITORY, ItemsRepository } from './repositories/items.repository'
import { InventarioService } from './services/inventario.service'

@Module({
  controllers: [InventarioController],
  providers: [
    InventarioService,
    {
      provide: ITEMS_REPOSITORY,
      useClass: ItemsRepository,
    },
  ],
  exports: [ITEMS_REPOSITORY, InventarioService],
})
export class InventarioModule {}
