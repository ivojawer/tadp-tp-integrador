import { Module } from '@nestjs/common'
import { InventarioModule } from '../inventario/inventario.module'
import { OrdenesController } from './controllers/ordenes.controller'
import { ORDENES_REPOSITORY, OrdenesRepository } from './repositories/ordenes.repository'
import { OrdenesService } from './services/ordenes.service'

@Module({
  imports: [InventarioModule],
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
