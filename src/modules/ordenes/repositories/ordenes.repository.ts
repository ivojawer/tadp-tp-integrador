import { Inject, Injectable } from '@nestjs/common'
import { Kysely, Transaction } from 'kysely'
import { KYSELY_DB } from '../../../common/database/database.provider'
import { Database } from '../../../common/database/types'
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto'
import { EstadoFisicoItem } from '../../inventario/entities/item.entity'
import { EstadoOrden, ItemPedido, Orden } from '../entities/orden.entity'

export interface IOrdenesRepository {
  findById(id: number, trx?: Transaction<Database>): Promise<Orden | null>
  findAll(
    filtros?: { estado?: EstadoOrden; pageSize?: number; offset?: number },
    trx?: Transaction<Database>,
  ): Promise<PaginatedResponseDto<Orden>>
  create(
    data: {
      clienteNombre: string
      clienteDireccion: string
      items: { productoSku: string; cantidad: number }[]
    },
    onTransaction?: (ordenId: number, trx: Transaction<Database>) => Promise<void>,
  ): Promise<Orden>
  updateEstado(
    id: number,
    nuevoEstado: EstadoOrden,
    options?: { repartidorLegajo?: string; vehiculoId?: number; fechaCompletada?: Date },
    onTransaction?: (ordenId: number, trx: Transaction<Database>) => Promise<void>,
  ): Promise<Orden>
}

export const ORDENES_REPOSITORY = 'ORDENES_REPOSITORY'

@Injectable()
export class OrdenesRepository implements IOrdenesRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<Database>) {}

  async findById(id: number, trx?: Transaction<Database>): Promise<Orden | null> {
    const executor = trx ?? this.db
    const rows = await executor
      .selectFrom('ordenes')
      .leftJoin('items_pedidos', 'items_pedidos.orden_id', 'ordenes.id')
      .select([
        'ordenes.id as orden_id',
        'ordenes.cliente_nombre',
        'ordenes.cliente_direccion',
        'ordenes.estado',
        'ordenes.fecha_completada',
        'ordenes.repartidor_legajo',
        'ordenes.vehiculo_id',
        'items_pedidos.id as item_pedido_id',
        'items_pedidos.producto_sku as item_pedido_sku',
        'items_pedidos.cantidad as item_pedido_cantidad',
      ])
      .where('ordenes.id', '=', id)
      .execute()

    if (rows.length === 0) {
      return null
    }

    const firstRow = rows[0]

    // Cargar los items físicos asignados a esta orden
    const itemsFisicos = await executor
      .selectFrom('items')
      .selectAll()
      .where('orden_id', '=', id)
      .execute()

    const itemsPedidos: ItemPedido[] = []
    const seenItemPedidoIds = new Set<number>()

    for (const r of rows) {
      if (r.item_pedido_id && !seenItemPedidoIds.has(r.item_pedido_id)) {
        seenItemPedidoIds.add(r.item_pedido_id)

        const itemsAsignados = itemsFisicos
          .filter((item) => item.producto_sku === r.item_pedido_sku)
          .map((item) => ({
            id: item.id,
            productoSku: item.producto_sku,
            estadoFisico: item.estado_fisico as EstadoFisicoItem,
            ordenId: item.orden_id,
          }))

        itemsPedidos.push({
          id: r.item_pedido_id,
          productoSku: r.item_pedido_sku!,
          cantidad: r.item_pedido_cantidad!,
          items: itemsAsignados,
        })
      }
    }

    return {
      id: firstRow.orden_id,
      clienteNombre: firstRow.cliente_nombre,
      clienteDireccion: firstRow.cliente_direccion,
      estado: firstRow.estado as EstadoOrden,
      fechaCompletada: firstRow.fecha_completada,
      repartidorLegajo: firstRow.repartidor_legajo,
      vehiculoId: firstRow.vehiculo_id,
      itemsPedidos,
    }
  }

  async findAll(
    filtros?: { estado?: EstadoOrden; pageSize?: number; offset?: number },
    trx?: Transaction<Database>,
  ): Promise<PaginatedResponseDto<Orden>> {
    const executor = trx ?? this.db
    const pageSize = filtros?.pageSize ?? 10
    const offset = filtros?.offset ?? 0

    let query = executor.selectFrom('ordenes').selectAll().orderBy('id', 'asc')

    if (filtros?.estado) {
      query = query.where('estado', '=', filtros.estado)
    }

    query = query.offset(offset).limit(pageSize + 1)

    const ordenesRows = await query.execute()

    const hasNextPage = ordenesRows.length > pageSize
    const pagedOrdenesRows = hasNextPage ? ordenesRows.slice(0, pageSize) : ordenesRows

    if (pagedOrdenesRows.length === 0) {
      return {
        data: [],
        offset,
        pageSize,
        hasNextPage: false,
      }
    }

    const ordenIds = pagedOrdenesRows.map((o) => o.id)

    const itemsPedidosRows = await executor
      .selectFrom('items_pedidos')
      .selectAll()
      .where('orden_id', 'in', ordenIds)
      .execute()

    const itemsFisicosRows = await executor
      .selectFrom('items')
      .selectAll()
      .where('orden_id', 'in', ordenIds)
      .execute()

    const data = pagedOrdenesRows.map((orden) => {
      const itemsPedidosDeOrden = itemsPedidosRows
        .filter((ip) => ip.orden_id === orden.id)
        .map((ip) => {
          const itemsAsignados = itemsFisicosRows
            .filter((item) => item.orden_id === orden.id && item.producto_sku === ip.producto_sku)
            .map((item) => ({
              id: item.id,
              productoSku: item.producto_sku,
              estadoFisico: item.estado_fisico as EstadoFisicoItem,
              ordenId: item.orden_id,
            }))

          return {
            id: ip.id,
            productoSku: ip.producto_sku,
            cantidad: ip.cantidad,
            items: itemsAsignados,
          }
        })

      return {
        id: orden.id,
        clienteNombre: orden.cliente_nombre,
        clienteDireccion: orden.cliente_direccion,
        estado: orden.estado as EstadoOrden,
        fechaCompletada: orden.fecha_completada,
        repartidorLegajo: orden.repartidor_legajo,
        vehiculoId: orden.vehiculo_id,
        itemsPedidos: itemsPedidosDeOrden,
      }
    })

    return {
      data,
      offset,
      pageSize,
      hasNextPage,
    }
  }

  async create(
    data: {
      clienteNombre: string
      clienteDireccion: string
      items: { productoSku: string; cantidad: number }[]
    },
    onTransaction?: (ordenId: number, trx: Transaction<Database>) => Promise<void>,
  ): Promise<Orden> {
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

      let itemsPedidos: ItemPedido[] = []

      if (data.items.length > 0) {
        const insertedRows = await trx
          .insertInto('items_pedidos')
          .values(
            data.items.map((item) => ({
              orden_id: insertedOrder.id,
              producto_sku: item.productoSku,
              cantidad: item.cantidad,
            })),
          )
          .returningAll()
          .execute()

        itemsPedidos = insertedRows.map((r) => ({
          id: r.id,
          productoSku: r.producto_sku,
          cantidad: r.cantidad,
          items: [],
        }))
      }

      if (onTransaction) {
        await onTransaction(insertedOrder.id, trx)
      }

      return {
        id: insertedOrder.id,
        clienteNombre: insertedOrder.cliente_nombre,
        clienteDireccion: insertedOrder.cliente_direccion,
        estado: insertedOrder.estado as EstadoOrden,
        fechaCompletada: insertedOrder.fecha_completada,
        repartidorLegajo: insertedOrder.repartidor_legajo,
        vehiculoId: insertedOrder.vehiculo_id,
        itemsPedidos,
      }
    })
  }

  async updateEstado(
    id: number,
    nuevoEstado: EstadoOrden,
    options?: { repartidorLegajo?: string; vehiculoId?: number; fechaCompletada?: Date },
    onTransaction?: (ordenId: number, trx: Transaction<Database>) => Promise<void>,
  ): Promise<Orden> {
    return await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('ordenes')
        .set({
          estado: nuevoEstado,
          repartidor_legajo: options?.repartidorLegajo ?? null,
          vehiculo_id: options?.vehiculoId ?? null,
          fecha_completada: options?.fechaCompletada ?? null,
        })
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      if (onTransaction) {
        await onTransaction(id, trx)
      }

      const orden = await this.findById(id, trx)
      return orden!
    })
  }
}
