import { IsNumber } from 'class-validator'

export class SuscribirOrdenDto {
  @IsNumber()
  ordenId: number
}
