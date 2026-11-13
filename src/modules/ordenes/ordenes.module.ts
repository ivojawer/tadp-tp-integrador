import { Module } from '@nestjs/common'
import { OrdenesController } from './controllers/ordenes.controller'
import { ORDENES_REPOSITORY, OrdenesRepository } from './repositories/ordenes.repository'
import { OrdenesService } from './services/ordenes.service'

@Module({
  controllers: [OrdenesController],
  providers: [
    OrdenesService,
    {
      provide: ORDENES_REPOSITORY,
      useClass: OrdenesRepository,
    },
  ],
  exports: [OrdenesService],
})
export class OrdenesModule {}
