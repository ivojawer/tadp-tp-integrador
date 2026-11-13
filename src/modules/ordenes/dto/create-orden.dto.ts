import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator'

export class ItemPedidoDto {
  @ApiProperty({ example: 'PROD-001', description: 'SKU del producto a ordenar' })
  @IsString()
  @IsNotEmpty()
  productoSku: string

  @ApiProperty({ example: 2, description: 'Cantidad de unidades requeridas' })
  @IsInt()
  @IsPositive()
  cantidad: number
}

export class CreateOrdenDto {
  @ApiProperty({ example: 'Carlos Gómez', description: 'Nombre completo del cliente' })
  @IsString()
  @IsNotEmpty()
  clienteNombre: string

  @ApiProperty({
    example: 'Calle Falsa 123, CABA',
    description: 'Dirección de destino de la entrega',
  })
  @IsString()
  @IsNotEmpty()
  clienteDireccion: string

  @ApiProperty({ type: [ItemPedidoDto], description: 'Listado de items pedidos' })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ItemPedidoDto)
  items: ItemPedidoDto[]
}
