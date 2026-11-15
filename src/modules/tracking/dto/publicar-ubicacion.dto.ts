import { IsNumber } from 'class-validator'

export class PublicarUbicacionDto {
  @IsNumber()
  vehiculoId: number

  @IsNumber()
  latitud: number

  @IsNumber()
  longitud: number
}
