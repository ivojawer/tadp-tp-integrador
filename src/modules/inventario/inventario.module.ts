import { Module } from '@nestjs/common'
import { ITEMS_REPOSITORY, ItemsRepository } from './repositories/items.repository'

@Module({
  providers: [
    {
      provide: ITEMS_REPOSITORY,
      useClass: ItemsRepository,
    },
  ],
  exports: [ITEMS_REPOSITORY],
})
export class InventarioModule {}
