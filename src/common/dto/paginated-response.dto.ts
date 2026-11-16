import { ApiProperty } from '@nestjs/swagger'

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'Listado de elementos de la página' })
  data: T[]

  @ApiProperty({ example: 0, description: 'Cantidad de registros omitidos' })
  offset: number

  @ApiProperty({ example: 10, description: 'Cantidad máxima de registros por página' })
  pageSize: number

  @ApiProperty({ example: false, description: 'Indica si existe una página siguiente' })
  hasNextPage: boolean
}
