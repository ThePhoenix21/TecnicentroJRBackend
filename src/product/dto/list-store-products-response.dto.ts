import { ApiProperty } from '@nestjs/swagger';
import { ListStoreProductItemDto } from './list-store-product-item.dto';

export class ListStoreProductsResponseDto {
  @ApiProperty({ type: [ListStoreProductItemDto] })
  data!: ListStoreProductItemDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  pageSize!: number;
}
