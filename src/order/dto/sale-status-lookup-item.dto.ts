import { ApiProperty } from '@nestjs/swagger';
import { SaleStatus } from '@prisma/client';

export class SaleStatusLookupItemDto {
  @ApiProperty({ enum: SaleStatus })
  value!: SaleStatus;

  @ApiProperty({ example: 'PENDING' })
  label!: string;
}
