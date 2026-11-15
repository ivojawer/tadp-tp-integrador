import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'
import { EstadoOrden } from '../entities/orden.entity'

export class FindOrdenesQueryDto {
  @ApiPropertyOptional({
    enum: EstadoOrden,
    example: EstadoOrden.PEDIDA,
    description: 'Filtrar órdenes por estado logístico',
  })
  @IsOptional()
  @IsEnum(EstadoOrden)
  estado?: EstadoOrden
}
