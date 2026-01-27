import { ApiProperty } from '@nestjs/swagger';
import { ListInventoryMovementItemDto } from './list-inventory-movement-item.dto';

export class ListInventoryMovementsResponseDto {
  @ApiProperty({ type: [ListInventoryMovementItemDto] })
  data!: ListInventoryMovementItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
