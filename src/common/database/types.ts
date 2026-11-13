import { Generated } from 'kysely'

export interface Database {
  usuarios: UsuarioTable
  vehiculos: VehiculoTable
  productos: ProductoTable
  ordenes: OrdenTable
  items_pedidos: ItemPedidoTable
  items: ItemTable
  geo_logs: GeoLogTable
}

export interface UsuarioTable {
  legajo: string
  nombre: string
  email: string
  password: string
}

export interface VehiculoTable {
  id: Generated<number>
  modelo: string
  capacidad_volumen: number
  capacidad_peso: number
}

export interface ProductoTable {
  sku: string
  nombre: string
  descripcion: string
  marca: string
}

export interface OrdenTable {
  id: Generated<number>
  cliente_nombre: string
  cliente_direccion: string
  estado: string
  fecha_completada: Date | null
  repartidor_legajo: string | null
  vehiculo_id: number | null
}

export interface ItemPedidoTable {
  id: Generated<number>
  orden_id: number
  producto_sku: string
  cantidad: number
}

export interface ItemTable {
  id: Generated<number>
  producto_sku: string
  estado_fisico: string
  orden_id: number | null
}

export interface GeoLogTable {
  id: Generated<number>
  orden_id: number
  latitud: number
  longitud: number
  fecha_hora: Date
}
