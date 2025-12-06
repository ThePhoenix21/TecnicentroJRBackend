import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInventoryCountItemDto {
  @ApiProperty({
    description: 'Cantidad física contada actualizada',
    example: 45,
    minimum: 0
  })
  @IsInt()
  @Min(0)
  physicalStock: number;
}
