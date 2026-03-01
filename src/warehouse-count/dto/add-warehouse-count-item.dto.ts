import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AddWarehouseCountItemDto {
  @ApiProperty()
  @IsUUID()
  warehouseProductId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  physicalStock: number;
}
