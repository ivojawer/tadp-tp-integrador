import { ApiProperty } from '@nestjs/swagger'

export class Vehiculo {
  @ApiProperty({ example: 1, description: 'ID único del vehículo' })
  id: number

  @ApiProperty({ example: 'Renault Kangoo', description: 'Modelo o descripción del vehículo' })
  modelo: string

  @ApiProperty({ example: 3.0, description: 'Capacidad de carga en volumen (m³)' })
  capacidadVolumen: number

  @ApiProperty({ example: 650.0, description: 'Capacidad máxima de carga en peso (kg)' })
  capacidadPeso: number
}
