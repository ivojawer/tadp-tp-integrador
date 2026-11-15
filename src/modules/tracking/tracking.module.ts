import { Module } from '@nestjs/common'
import { GeoLogsRepository, GEOLOGS_REPOSITORY } from './repositories/geo-logs.repository'

@Module({
  providers: [
    {
      provide: GEOLOGS_REPOSITORY,
      useClass: GeoLogsRepository,
    },
  ],
  exports: [GEOLOGS_REPOSITORY],
})
export class TrackingModule {}
