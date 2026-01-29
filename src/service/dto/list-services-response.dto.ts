import { ApiProperty } from '@nestjs/swagger';
import { ListServiceItemDto } from './list-service-item.dto';

export class ListServicesResponseDto {
  @ApiProperty({ type: [ListServiceItemDto] })
  data!: ListServiceItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
