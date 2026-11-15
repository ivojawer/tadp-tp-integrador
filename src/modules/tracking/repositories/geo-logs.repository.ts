import { Inject, Injectable } from '@nestjs/common'
import { Kysely, Transaction } from 'kysely'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { GeoLog } from '../entities/geo-log.entity'

export interface IGeoLogsRepository {
  registrar(
    data: Omit<GeoLog, 'id' | 'fechaHora'> & { fechaHora?: Date },
    trx?: Transaction<Database>,
  ): Promise<GeoLog>
  findByVehiculo(vehiculoId: number, trx?: Transaction<Database>): Promise<GeoLog[]>
  findUltimoByVehiculo(vehiculoId: number, trx?: Transaction<Database>): Promise<GeoLog | null>
}

export const GEOLOGS_REPOSITORY = 'GEOLOGS_REPOSITORY'

@Injectable()
export class GeoLogsRepository implements IGeoLogsRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<Database>) {}

  private toDomain(row: {
    id: number
    vehiculo_id: number
    latitud: number | string
    longitud: number | string
    fecha_hora: Date
  }): GeoLog {
    return {
      id: row.id,
      vehiculoId: row.vehiculo_id,
      latitud: Number(row.latitud),
      longitud: Number(row.longitud),
      fechaHora: row.fecha_hora,
    }
  }

  async registrar(
    data: Omit<GeoLog, 'id' | 'fechaHora'> & { fechaHora?: Date },
    trx?: Transaction<Database>,
  ): Promise<GeoLog> {
    const executor = trx ?? this.db

    const inserted = await executor
      .insertInto('geo_logs')
      .values({
        vehiculo_id: data.vehiculoId,
        latitud: data.latitud,
        longitud: data.longitud,
        fecha_hora: data.fechaHora ?? new Date(),
      })
      .returning(['id', 'vehiculo_id', 'latitud', 'longitud', 'fecha_hora'])
      .executeTakeFirstOrThrow()

    return this.toDomain(inserted)
  }

  async findByVehiculo(vehiculoId: number, trx?: Transaction<Database>): Promise<GeoLog[]> {
    const executor = trx ?? this.db
    const rows = await executor
      .selectFrom('geo_logs')
      .selectAll()
      .where('vehiculo_id', '=', vehiculoId)
      .orderBy('fecha_hora', 'asc')
      .execute()

    return rows.map((row) => this.toDomain(row))
  }

  async findUltimoByVehiculo(
    vehiculoId: number,
    trx?: Transaction<Database>,
  ): Promise<GeoLog | null> {
    const executor = trx ?? this.db
    const row = await executor
      .selectFrom('geo_logs')
      .selectAll()
      .where('vehiculo_id', '=', vehiculoId)
      .orderBy('fecha_hora', 'desc')
      .executeTakeFirst()

    if (!row) return null
    return this.toDomain(row)
  }
}
