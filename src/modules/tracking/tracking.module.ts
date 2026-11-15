import { Module } from '@nestjs/common'
import { OrdenesModule } from '../ordenes/ordenes.module'
import { VehiculosModule } from '../vehiculos/vehiculos.module'
import { TrackingController } from './controllers/tracking.controller'
import { GeoLogsRepository, GEOLOGS_REPOSITORY } from './repositories/geo-logs.repository'
import { TrackingService } from './services/tracking.service'

@Module({
  imports: [OrdenesModule, VehiculosModule],
  controllers: [TrackingController],
  providers: [
    TrackingService,
    {
      provide: GEOLOGS_REPOSITORY,
      useClass: GeoLogsRepository,
    },
  ],
  exports: [GEOLOGS_REPOSITORY],
})
export class TrackingModule {}
