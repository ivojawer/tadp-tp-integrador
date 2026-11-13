import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'
import { EstadoOrden } from '../entities/orden.entity'

export class UpdateEstadoOrdenDto {
  @ApiProperty({
    enum: EstadoOrden,
    example: EstadoOrden.LISTA,
    description: 'Nuevo estado de la orden',
  })
  @IsEnum(EstadoOrden)
  @IsNotEmpty()
  nuevoEstado: EstadoOrden

  @ApiProperty({
    required: false,
    example: 'REP-101',
    description: 'Legajo del repartidor si pasa a Enviada',
  })
  @IsOptional()
  @IsString()
  repartidorLegajo?: string

  @ApiProperty({
    required: false,
    example: 1,
    description: 'ID del vehículo asignado si pasa a Enviada',
  })
  @IsOptional()
  @IsNumber()
  vehiculoId?: number
}
