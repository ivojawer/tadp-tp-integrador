import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import { DatabaseModule } from '../../../common/database/database.module'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { GEOLOGS_REPOSITORY, GeoLogsRepository } from '../repositories/geo-logs.repository'

describe('GeoLogsRepository (Integration with test DB)', () => {
  let repository: GeoLogsRepository
  let db: Kysely<Database>
  let testVehiculoId: number

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.development', '.env'],
        }),
        DatabaseModule,
      ],
      providers: [
        {
          provide: GEOLOGS_REPOSITORY,
          useClass: GeoLogsRepository,
        },
      ],
    }).compile()

    repository = module.get<GeoLogsRepository>(GEOLOGS_REPOSITORY)
    db = module.get<Kysely<Database>>(KYSELY_DB)

    // Crear un vehículo de prueba para satisfacer FK
    const vehiculo = await db
      .insertInto('vehiculos')
      .values({
        modelo: 'Test Vehicle T3',
        capacidad_volumen: 5.0,
        capacidad_peso: 1000.0,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    testVehiculoId = vehiculo.id
  })

  afterAll(async () => {
    if (db) {
      await db.deleteFrom('geo_logs').where('vehiculo_id', '=', testVehiculoId).execute()
      await db.deleteFrom('vehiculos').where('id', '=', testVehiculoId).execute()
      await db.destroy()
    }
  })

  beforeEach(async () => {
    await db.deleteFrom('geo_logs').where('vehiculo_id', '=', testVehiculoId).execute()
  })

  describe('registrar', () => {
    it('inserta correctamente y retorna el GeoLog con id y fechaHora generados', async () => {
      const result = await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.6037,
        longitud: -58.3816,
      })

      expect(result.id).toBeDefined()
      expect(typeof result.id).toBe('number')
      expect(result.vehiculoId).toBe(testVehiculoId)
      expect(result.latitud).toBeCloseTo(-34.6037)
      expect(result.longitud).toBeCloseTo(-58.3816)
      expect(result.fechaHora).toBeInstanceOf(Date)

      // Verificar persistencia real en DB
      const enDb = await db
        .selectFrom('geo_logs')
        .selectAll()
        .where('id', '=', result.id)
        .executeTakeFirst()

      expect(enDb).toBeDefined()
      expect(enDb?.vehiculo_id).toBe(testVehiculoId)
    })
  })

  describe('findByVehiculo', () => {
    it('retorna los logs de ese vehículo ordenados por fecha_hora ASC', async () => {
      const fecha1 = new Date('2026-01-01T10:00:00Z')
      const fecha2 = new Date('2026-01-01T12:00:00Z')
      const fecha3 = new Date('2026-01-01T11:00:00Z')

      await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.0,
        longitud: -58.0,
        fechaHora: fecha1,
      })
      await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.1,
        longitud: -58.1,
        fechaHora: fecha2,
      })
      await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.2,
        longitud: -58.2,
        fechaHora: fecha3,
      })

      const logs = await repository.findByVehiculo(testVehiculoId)

      expect(logs).toHaveLength(3)
      // Ordenados ASC: fecha1, fecha3, fecha2
      expect(logs[0].fechaHora.getTime()).toBe(fecha1.getTime())
      expect(logs[1].fechaHora.getTime()).toBe(fecha3.getTime())
      expect(logs[2].fechaHora.getTime()).toBe(fecha2.getTime())
    })

    it('retorna array vacío cuando el vehículo no tiene logs', async () => {
      const logs = await repository.findByVehiculo(testVehiculoId)
      expect(logs).toEqual([])
    })
  })

  describe('findUltimoByVehiculo', () => {
    it('retorna el log más reciente del vehículo', async () => {
      const fecha1 = new Date('2026-01-01T10:00:00Z')
      const fecha2 = new Date('2026-01-01T12:00:00Z')

      await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.0,
        longitud: -58.0,
        fechaHora: fecha1,
      })
      await repository.registrar({
        vehiculoId: testVehiculoId,
        latitud: -34.5,
        longitud: -58.5,
        fechaHora: fecha2,
      })

      const ultimo = await repository.findUltimoByVehiculo(testVehiculoId)

      expect(ultimo).not.toBeNull()
      expect(ultimo!.fechaHora.getTime()).toBe(fecha2.getTime())
      expect(ultimo!.latitud).toBeCloseTo(-34.5)
      expect(ultimo!.longitud).toBeCloseTo(-58.5)
    })

    it('retorna null cuando el vehículo no tiene logs', async () => {
      const result = await repository.findUltimoByVehiculo(testVehiculoId)
      expect(result).toBeNull()
    })
  })
})
