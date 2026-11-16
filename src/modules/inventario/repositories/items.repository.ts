import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { Kysely, Transaction, sql } from 'kysely'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { EstadoItemsDto } from '../dto/estado-items.dto'
import { EstadoFisicoItem, Item } from '../entities/item.entity'

export interface IItemsRepository {
  crearItem(
    data: {
      productoSku: string
      estadoFisico?: EstadoFisicoItem
      ordenId?: number | null
    },
    trx?: Transaction<Database>,
  ): Promise<Item>
  countDisponibles(productoSku: string): Promise<number>
  reservar(
    productoSku: string,
    cantidad: number,
    ordenId: number,
    trx: Transaction<Database>,
  ): Promise<void>
  prepararPorOrden(ordenId: number, trx?: Transaction<Database>): Promise<void>
  entregarPorOrden(ordenId: number, trx?: Transaction<Database>): Promise<void>
  findByOrden(ordenId: number): Promise<Item[]>
  obtenerEstadoItems(pagination?: {
    pageSize?: number
    offset?: number
  }): Promise<PaginatedResponseDto<EstadoItemsDto>>
}

export const ITEMS_REPOSITORY = 'ITEMS_REPOSITORY'

@Injectable()
export class ItemsRepository implements IItemsRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<Database>) {}

  async crearItem(
    data: {
      productoSku: string
      estadoFisico?: EstadoFisicoItem
      ordenId?: number | null
    },
    trx?: Transaction<Database>,
  ): Promise<Item> {
    const executor = trx ?? this.db
    const inserted = await executor
      .insertInto('items')
      .values({
        producto_sku: data.productoSku,
        estado_fisico: data.estadoFisico ?? EstadoFisicoItem.DISPONIBLE,
        orden_id: data.ordenId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapToEntity(inserted)
  }

  async countDisponibles(productoSku: string): Promise<number> {
    const result = await this.db
      .selectFrom('items')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('producto_sku', '=', productoSku)
      .where('estado_fisico', '=', EstadoFisicoItem.DISPONIBLE)
      .executeTakeFirstOrThrow()

    return Number(result.count)
  }

  async reservar(
    productoSku: string,
    cantidad: number,
    ordenId: number,
    trx: Transaction<Database>,
  ): Promise<void> {
    const disponibles = await trx
      .selectFrom('items')
      .select('id')
      .where('producto_sku', '=', productoSku)
      .where('estado_fisico', '=', EstadoFisicoItem.DISPONIBLE)
      .limit(cantidad)
      .execute()

    if (disponibles.length < cantidad) {
      throw new UnprocessableEntityException(
        `Stock insuficiente para el producto '${productoSku}': se requieren ${cantidad} pero hay ${disponibles.length} disponibles`,
      )
    }

    const ids = disponibles.map((row) => row.id)

    await trx
      .updateTable('items')
      .set({
        estado_fisico: EstadoFisicoItem.RESERVADO,
        orden_id: ordenId,
      })
      .where('id', 'in', ids)
      .execute()
  }

  async prepararPorOrden(ordenId: number, trx?: Transaction<Database>): Promise<void> {
    const executor = trx ?? this.db
    await executor
      .updateTable('items')
      .set({ estado_fisico: EstadoFisicoItem.PREPARADO })
      .where('orden_id', '=', ordenId)
      .where('estado_fisico', '=', EstadoFisicoItem.RESERVADO)
      .execute()
  }

  async entregarPorOrden(ordenId: number, trx?: Transaction<Database>): Promise<void> {
    const executor = trx ?? this.db
    await executor
      .updateTable('items')
      .set({ estado_fisico: EstadoFisicoItem.ENTREGADO })
      .where('orden_id', '=', ordenId)
      .where('estado_fisico', '=', EstadoFisicoItem.PREPARADO)
      .execute()
  }

  async findByOrden(ordenId: number): Promise<Item[]> {
    const rows = await this.db
      .selectFrom('items')
      .selectAll()
      .where('orden_id', '=', ordenId)
      .execute()

    return rows.map((row) => this.mapToEntity(row))
  }

  async obtenerEstadoItems(pagination?: {
    pageSize?: number
    offset?: number
  }): Promise<PaginatedResponseDto<EstadoItemsDto>> {
    const pageSize = pagination?.pageSize ?? 10
    const offset = pagination?.offset ?? 0

    const query = this.db
      .selectFrom('items')
      .select([
        'producto_sku as sku',
        sql<number>`count(case when estado_fisico = ${EstadoFisicoItem.DISPONIBLE} then 1 end)::int`.as(
          'disponibles',
        ),
        sql<number>`count(case when estado_fisico = ${EstadoFisicoItem.RESERVADO} then 1 end)::int`.as(
          'reservados',
        ),
      ])
      .groupBy('producto_sku')
      .orderBy('producto_sku', 'asc')
      .offset(offset)
      .limit(pageSize + 1)

    const rows = await query.execute()

    const hasNextPage = rows.length > pageSize
    const pagedRows = hasNextPage ? rows.slice(0, pageSize) : rows

    return {
      data: pagedRows.map((row) => ({
        sku: row.sku,
        disponibles: Number(row.disponibles),
        reservados: Number(row.reservados),
      })),
      offset,
      pageSize,
      hasNextPage,
    }
  }

  private mapToEntity(row: {
    id: number
    producto_sku: string
    estado_fisico: string
    orden_id: number | null
  }): Item {
    return {
      id: row.id,
      productoSku: row.producto_sku,
      estadoFisico: row.estado_fisico as EstadoFisicoItem,
      ordenId: row.orden_id,
    }
  }
}
