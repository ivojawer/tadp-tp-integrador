import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { DatabaseModule } from './common/database/database.module'
import { InventarioModule } from './modules/inventario/inventario.module'
import { OrdenesModule } from './modules/ordenes/ordenes.module'
import { TrackingModule } from './modules/tracking/tracking.module'
import { UsuariosModule } from './modules/usuarios/usuarios.module'
import { VehiculosModule } from './modules/vehiculos/vehiculos.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production'
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                  },
                },
          },
        }
      },
    }),
    DatabaseModule,
    OrdenesModule,
    InventarioModule,
    TrackingModule,
    UsuariosModule,
    VehiculosModule,
  ],
})
export class AppModule {}
