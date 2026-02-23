import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class ListStoreProductsDto extends BasePaginationDto {
  @ApiProperty({ description: 'ID de la tienda', example: '456e7890-e12b-34d5-a678-426614174000' })
  @IsUUID()
  storeId!: string;

  @ApiPropertyOptional({ description: 'Filtrar por nombre del producto', example: 'aceite' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Si es true, filtra solo productos con stock disponible (stock > 0) manteniendo la paginación',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  inStock?: boolean;
}
