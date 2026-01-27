import { ApiProperty } from '@nestjs/swagger';

export class ListClientItemDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: 'Juan Pérez', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'juan@gmail.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: '987654321', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: '76543210' })
  dni!: string;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiProperty({ example: 12 })
  salesCount!: number;

  @ApiProperty({ example: 2 })
  cancelledCount!: number;
}
