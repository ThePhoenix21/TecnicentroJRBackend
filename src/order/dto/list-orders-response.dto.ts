import { ApiProperty } from '@nestjs/swagger';
import { ListOrderItemDto } from './list-order-item.dto';

export class ListOrdersResponseDto {
  @ApiProperty({ type: [ListOrderItemDto] })
  data!: ListOrderItemDto[];

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 4 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
