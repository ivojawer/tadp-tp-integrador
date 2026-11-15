import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Kysely } from 'kysely'
import { DatabaseModule } from '../../../common/database/database.module'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { VEHICULOS_REPOSITORY, VehiculosRepository } from '../repositories/vehiculos.repository'

describe('VehiculosRepository (Integration with test DB)', () => {
  let repository: VehiculosRepository
  let db: Kysely<Database>

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
          provide: VEHICULOS_REPOSITORY,
          useClass: VehiculosRepository,
        },
      ],
    }).compile()

    repository = module.get<VehiculosRepository>(VEHICULOS_REPOSITORY)
    db = module.get<Kysely<Database>>(KYSELY_DB)
  })

  afterAll(async () => {
    if (db) {
      await db.updateTable('ordenes').set({ vehiculo_id: null }).execute()
      await db.deleteFrom('vehiculos').execute()
      await db.destroy()
    }
  })

  beforeEach(async () => {
    await db.updateTable('ordenes').set({ vehiculo_id: null }).execute()
    await db.deleteFrom('vehiculos').execute()
  })

  describe('findAll', () => {
    it('retorna una lista vacía cuando no hay vehículos registrados', async () => {
      const result = await repository.findAll()
      expect(result).toEqual([])
    })

    it('retorna todos los vehículos insertados correctamente mapeados a camelCase', async () => {
      await repository.create({
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      })
      await repository.create({
        modelo: 'Mercedes Sprinter',
        capacidadVolumen: 10.5,
        capacidadPeso: 1500.0,
      })

      const vehiculos = await repository.findAll()
      expect(vehiculos).toHaveLength(2)
      expect(vehiculos[0].modelo).toBe('Renault Kangoo')
      expect(vehiculos[0].capacidadVolumen).toBe(3.0)
      expect(vehiculos[0].capacidadPeso).toBe(650.0)
      expect(vehiculos[1].modelo).toBe('Mercedes Sprinter')
      expect(vehiculos[1].capacidadVolumen).toBe(10.5)
      expect(vehiculos[1].capacidadPeso).toBe(1500.0)
    })
  })

  describe('findById', () => {
    it('retorna el vehículo correspondiente cuando existe en la base de datos', async () => {
      const created = await repository.create({
        modelo: 'Ford Transit',
        capacidadVolumen: 8.5,
        capacidadPeso: 1200.0,
      })

      const found = await repository.findById(created.id)
      expect(found).not.toBeNull()
      expect(found?.id).toBe(created.id)
      expect(found?.modelo).toBe('Ford Transit')
      expect(found?.capacidadVolumen).toBe(8.5)
      expect(found?.capacidadPeso).toBe(1200.0)
    })

    it('retorna null si el vehículo no existe', async () => {
      const found = await repository.findById(999999)
      expect(found).toBeNull()
    })
  })

  describe('create', () => {
    it('inserta y retorna el vehículo con id autogenerado y persistido en DB', async () => {
      const nuevo = await repository.create({
        modelo: 'Peugeot Partner',
        capacidadVolumen: 3.3,
        capacidadPeso: 700.0,
      })

      expect(nuevo.id).toBeDefined()
      expect(typeof nuevo.id).toBe('number')
      expect(nuevo.modelo).toBe('Peugeot Partner')
      expect(nuevo.capacidadVolumen).toBe(3.3)
      expect(nuevo.capacidadPeso).toBe(700.0)

      const enDb = await db
        .selectFrom('vehiculos')
        .where('id', '=', nuevo.id)
        .selectAll()
        .executeTakeFirst()

      expect(enDb).toBeDefined()
      expect(enDb?.modelo).toBe('Peugeot Partner')
      expect(Number(enDb?.capacidad_volumen)).toBe(3.3)
      expect(Number(enDb?.capacidad_peso)).toBe(700.0)
    })
  })
})
