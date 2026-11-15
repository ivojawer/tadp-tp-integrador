import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator'

export class CreateVehiculoDto {
  @ApiProperty({ example: 'Renault Kangoo', description: 'Modelo o descripción del vehículo' })
  @IsString()
  @IsNotEmpty()
  modelo: string

  @ApiProperty({ example: 3.0, description: 'Capacidad de carga en volumen (m³)' })
  @IsNumber()
  @IsPositive()
  capacidadVolumen: number

  @ApiProperty({ example: 650.0, description: 'Capacidad máxima de carga en peso (kg)' })
  @IsNumber()
  @IsPositive()
  capacidadPeso: number
}
