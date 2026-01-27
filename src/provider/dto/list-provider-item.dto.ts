import { ApiProperty } from '@nestjs/swagger';

export class ListProviderItemDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: 'Proveedor S.A.' })
  name!: string;

  @ApiProperty({ example: '20123456789' })
  ruc!: string;

  @ApiProperty({ example: 'Av. Principal 123', nullable: true })
  address!: string | null;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiProperty({ example: 12 })
  activeOrdersCount!: number;

  @ApiProperty({ example: 2 })
  annulledOrdersCount!: number;
}
