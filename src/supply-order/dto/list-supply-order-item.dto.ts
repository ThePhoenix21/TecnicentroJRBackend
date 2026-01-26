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

  @ApiProperty({ example: 'Proveedor S.A.' })
  providerName!: string;

  @ApiProperty({ example: 'Tienda Principal', nullable: true })
  storeName!: string | null;

  @ApiProperty({ example: 'Almacén Central', nullable: true })
  warehouseName!: string | null;

  @ApiProperty({ example: 'James Cordova', nullable: true })
  creatorUser!: string | null;

  @ApiProperty({ example: 'jamescorcam@gmail.com', nullable: true })
  creatorUserEmail!: string | null;
}
