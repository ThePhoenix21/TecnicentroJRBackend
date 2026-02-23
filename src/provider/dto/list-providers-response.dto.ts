import { ApiProperty } from '@nestjs/swagger';
import { ListProviderItemDto } from './list-provider-item.dto';

export class ListProvidersResponseDto {
  @ApiProperty({ type: [ListProviderItemDto] })
  data!: ListProviderItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
