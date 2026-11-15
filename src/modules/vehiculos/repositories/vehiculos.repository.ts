import { Inject, Injectable } from '@nestjs/common'
import { Kysely, Transaction } from 'kysely'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { Vehiculo } from '../entities/vehiculo.entity'

export interface IVehiculosRepository {
  findAll(trx?: Transaction<Database>): Promise<Vehiculo[]>
  findById(id: number, trx?: Transaction<Database>): Promise<Vehiculo | null>
  create(data: Omit<Vehiculo, 'id'>, trx?: Transaction<Database>): Promise<Vehiculo>
}

export const VEHICULOS_REPOSITORY = 'VEHICULOS_REPOSITORY'

@Injectable()
export class VehiculosRepository implements IVehiculosRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<Database>) {}

  private toDomain(row: {
    id: number
    modelo: string
    capacidad_volumen: number | string
    capacidad_peso: number | string
  }): Vehiculo {
    return {
      id: row.id,
      modelo: row.modelo,
      capacidadVolumen: Number(row.capacidad_volumen),
      capacidadPeso: Number(row.capacidad_peso),
    }
  }

  async findAll(trx?: Transaction<Database>): Promise<Vehiculo[]> {
    const executor = trx ?? this.db
    const rows = await executor.selectFrom('vehiculos').selectAll().orderBy('id', 'asc').execute()

    return rows.map((row) => this.toDomain(row))
  }

  async findById(id: number, trx?: Transaction<Database>): Promise<Vehiculo | null> {
    const executor = trx ?? this.db
    const row = await executor
      .selectFrom('vehiculos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    if (!row) {
      return null
    }

    return this.toDomain(row)
  }

  async create(data: Omit<Vehiculo, 'id'>, trx?: Transaction<Database>): Promise<Vehiculo> {
    const executor = trx ?? this.db
    const inserted = await executor
      .insertInto('vehiculos')
      .values({
        modelo: data.modelo,
        capacidad_volumen: data.capacidadVolumen,
        capacidad_peso: data.capacidadPeso,
      })
      .returning(['id', 'modelo', 'capacidad_volumen', 'capacidad_peso'])
      .executeTakeFirstOrThrow()

    return this.toDomain(inserted)
  }
}
