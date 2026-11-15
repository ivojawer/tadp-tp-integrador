import { Module } from '@nestjs/common'
import { VehiculosController } from './controllers/vehiculos.controller'
import { VEHICULOS_REPOSITORY, VehiculosRepository } from './repositories/vehiculos.repository'
import { VehiculosService } from './services/vehiculos.service'

@Module({
  controllers: [VehiculosController],
  providers: [
    VehiculosService,
    {
      provide: VEHICULOS_REPOSITORY,
      useClass: VehiculosRepository,
    },
  ],
  exports: [VEHICULOS_REPOSITORY, VehiculosService],
})
export class VehiculosModule {}
