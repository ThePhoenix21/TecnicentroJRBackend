import { ApiProperty } from '@nestjs/swagger';
import { ListCashMovementItemDto } from './list-cash-movement-item.dto';

export class ListCashMovementsResponseDto {
  @ApiProperty({ type: [ListCashMovementItemDto] })
  data!: ListCashMovementItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
