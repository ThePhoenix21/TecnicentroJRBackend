import { IsString, IsNotEmpty, IsUUID, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddInventoryCountItemDto {
  @ApiProperty({
    description: 'ID del StoreProduct que se está contando',
    example: 'uuid-del-store-product'
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storeProductId: string;

  @ApiProperty({
    description: 'Cantidad física contada',
    example: 50,
    minimum: 0
  })
  @IsInt()
  @Min(0)
  physicalStock: number;
}
