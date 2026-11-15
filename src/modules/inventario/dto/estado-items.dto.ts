import { ApiProperty } from '@nestjs/swagger'

export class EstadoItemsDto {
  @ApiProperty({ example: 'PROD-001', description: 'SKU del producto' })
  sku: string

  @ApiProperty({ example: 5, description: 'Cantidad de items físicos en estado Disponible' })
  disponibles: number

  @ApiProperty({ example: 2, description: 'Cantidad de items físicos en estado Reservado' })
  reservados: number
}
