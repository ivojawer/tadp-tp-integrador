import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto'
import { EstadoOrden } from '../entities/orden.entity'

export class FindOrdenesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: EstadoOrden,
    example: EstadoOrden.PEDIDA,
    description: 'Filtrar órdenes por estado logístico',
  })
  @IsOptional()
  @IsEnum(EstadoOrden)
  estado?: EstadoOrden
}
