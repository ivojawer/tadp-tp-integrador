import { ApiProperty } from '@nestjs/swagger'

export enum EstadoFisicoItem {
  DISPONIBLE = 'Disponible',
  RESERVADO = 'Reservado',
  PREPARADO = 'Preparado',
  ENTREGADO = 'Entregado',
}

export class Item {
  @ApiProperty({ example: 1, description: 'ID único del item físico' })
  id: number

  @ApiProperty({ example: 'SKU-001', description: 'SKU del producto al que pertenece este item' })
  productoSku: string

  @ApiProperty({
    enum: EstadoFisicoItem,
    example: EstadoFisicoItem.DISPONIBLE,
    description: 'Estado físico actual del item en el warehouse',
  })
  estadoFisico: EstadoFisicoItem

  @ApiProperty({
    required: false,
    nullable: true,
    example: null,
    description: 'ID de la orden a la que fue asignado (null si está disponible en warehouse)',
  })
  ordenId: number | null
}
