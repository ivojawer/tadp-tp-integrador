import { ApiProperty } from '@nestjs/swagger'

export class GeoLog {
  @ApiProperty({ example: 1, description: 'ID único del registro de geolocalización' })
  id: number

  @ApiProperty({ example: 3, description: 'ID del vehículo cuya posición se registra' })
  vehiculoId: number

  @ApiProperty({ example: -34.6037, description: 'Latitud geográfica' })
  latitud: number

  @ApiProperty({ example: -58.3816, description: 'Longitud geográfica' })
  longitud: number

  @ApiProperty({ description: 'Fecha y hora del registro de posición' })
  fechaHora: Date
}
