import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { EstadoOrden, Orden } from '../entities/orden.entity'

export interface IOrdenesRepository {
  findById(id: number): Promise<Orden | null>
  create(data: {
    clienteNombre: string
    clienteDireccion: string
    items: { productoSku: string; cantidad: number }[]
  }): Promise<Orden>
  updateEstado(
    id: number,
    nuevoEstado: EstadoOrden,
    options?: { repartidorLegajo?: string; vehiculoId?: number; fechaCompletada?: Date },
  ): Promise<Orden>
}

export const ORDENES_REPOSITORY = 'ORDENES_REPOSITORY'

@Injectable()
export class OrdenesRepository implements IOrdenesRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<Database>) {}

  async findById(id: number): Promise<Orden | null> {
    const row = await this.db
      .selectFrom('ordenes')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    if (!row) {
      return null
    }

    return this.mapToEntity(row)
  }

  async create(data: {
    clienteNombre: string
    clienteDireccion: string
    items: { productoSku: string; cantidad: number }[]
  }): Promise<Orden> {
    return await this.db.transaction().execute(async (trx) => {
      const insertedOrder = await trx
        .insertInto('ordenes')
        .values({
          cliente_nombre: data.clienteNombre,
          cliente_direccion: data.clienteDireccion,
          estado: EstadoOrden.PEDIDA,
          fecha_completada: null,
          repartidor_legajo: null,
          vehiculo_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      if (data.items.length > 0) {
        await trx
          .insertInto('items_pedidos')
          .values(
            data.items.map((item) => ({
              orden_id: insertedOrder.id,
              producto_sku: item.productoSku,
              cantidad: item.cantidad,
            })),
          )
          .execute()
      }

      return this.mapToEntity(insertedOrder)
    })
  }

  async updateEstado(
    id: number,
    nuevoEstado: EstadoOrden,
    options?: { repartidorLegajo?: string; vehiculoId?: number; fechaCompletada?: Date },
  ): Promise<Orden> {
    const updated = await this.db
      .updateTable('ordenes')
      .set({
        estado: nuevoEstado,
        repartidor_legajo: options?.repartidorLegajo ?? null,
        vehiculo_id: options?.vehiculoId ?? null,
        fecha_completada: options?.fechaCompletada ?? null,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapToEntity(updated)
  }

  private mapToEntity(row: any): Orden {
    return {
      id: row.id,
      clienteNombre: row.cliente_nombre,
      clienteDireccion: row.cliente_direccion,
      estado: row.estado as EstadoOrden,
      fechaCompletada: row.fecha_completada,
      repartidorLegajo: row.repartidor_legajo,
      vehiculoId: row.vehiculo_id,
    }
  }
}
