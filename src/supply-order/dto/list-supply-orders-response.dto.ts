import { ApiProperty } from '@nestjs/swagger';
import { ListSupplyOrderItemDto } from './list-supply-order-item.dto';

export class ListSupplyOrdersResponseDto {
  @ApiProperty({ type: [ListSupplyOrderItemDto] })
  data!: ListSupplyOrderItemDto[];

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 4 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
