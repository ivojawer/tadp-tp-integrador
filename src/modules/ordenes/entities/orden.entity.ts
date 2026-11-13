import { ApiProperty } from '@nestjs/swagger'

export enum EstadoOrden {
  PEDIDA = 'Pedida',
  LISTA = 'Lista',
  ENVIADA = 'Enviada',
  COMPLETADA = 'Completada',
}

export class Orden {
  @ApiProperty({ example: 1, description: 'ID único de la orden' })
  id: number

  @ApiProperty({ example: 'Juan Pérez', description: 'Nombre del cliente' })
  clienteNombre: string

  @ApiProperty({ example: 'Av. Corrientes 1234', description: 'Dirección de entrega' })
  clienteDireccion: string

  @ApiProperty({
    enum: EstadoOrden,
    example: EstadoOrden.PEDIDA,
    description: 'Estado actual de la orden',
  })
  estado: EstadoOrden

  @ApiProperty({ required: false, nullable: true, example: null })
  fechaCompletada: Date | null

  @ApiProperty({ required: false, nullable: true, example: 'REP-001' })
  repartidorLegajo: string | null

  @ApiProperty({ required: false, nullable: true, example: 1 })
  vehiculoId: number | null
}
