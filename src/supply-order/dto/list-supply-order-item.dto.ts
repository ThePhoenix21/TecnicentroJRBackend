import { ApiProperty } from '@nestjs/swagger';

export class ListSupplyOrderItemDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: 'K1WWYNB1' })
  code!: string;

  @ApiProperty({ example: 'RECEIVED' })
  status!: string;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiProperty({ example: 'f1fa188b-ba01-4a65-a56f-debf27d81f7e' })
  providerId!: string;

  @ApiProperty({ example: 'cb488878-4478-45b2-9c80-9ed171528189', nullable: true })
  storeId!: string | null;

  @ApiProperty({ example: null, nullable: true })
  warehouseId!: string | null;
}
