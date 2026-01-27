import { ApiProperty } from '@nestjs/swagger';
import { ListClientItemDto } from './list-client-item.dto';

export class ListClientsResponseDto {
  @ApiProperty({ type: [ListClientItemDto] })
  data!: ListClientItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
