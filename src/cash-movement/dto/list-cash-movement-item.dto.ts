import { ApiProperty } from '@nestjs/swagger';

export class ListCashMovementItemDto {
  @ApiProperty({ example: '821d91fd-00db-45e2-bc2d-66c16ea755ce' })
  id!: string;

  @ApiProperty({ example: 'INCOME' })
  type!: string;

  @ApiProperty({ example: '100' })
  amount!: string;

  @ApiProperty({ example: 'EFECTIVO', nullable: true })
  payment!: string | null;

  @ApiProperty({ example: 'venta de "Aceite de Motor 10W40"', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'Juan Pérez', nullable: true })
  clientName!: string | null;

  @ApiProperty({ example: '2026-01-28T01:35:19.292Z' })
  createdAt!: Date;
}
