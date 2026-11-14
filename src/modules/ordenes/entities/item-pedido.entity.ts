import { ApiProperty } from '@nestjs/swagger'
import { Item } from '../../inventario/entities/item.entity'

export class ItemPedido {
  @ApiProperty({ example: 1, description: 'ID único del item pedido' })
  id: number

  @ApiProperty({ example: 'PROD-001', description: 'SKU del producto pedido' })
  productoSku: string

  @ApiProperty({ example: 2, description: 'Cantidad solicitada del producto' })
  cantidad: number

  @ApiProperty({
    type: () => [Item],
    description: 'Items físicos individuales asignados del warehouse',
  })
  items: Item[]
}
