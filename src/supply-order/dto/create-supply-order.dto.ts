import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplyOrderProductDto {
  @ApiProperty({ example: '1c5e23f3-253b-4cc3-a902-0efc86ad2766' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'Color negro', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSupplyOrderDto {
  @ApiProperty({ example: 'b7d2f3a1-1111-2222-3333-444444444444' })
  @IsUUID()
  providerId!: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description: 'Destino: almacén (no enviar si usa storeId)',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiProperty({
    example: 'c1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description: 'Destino: tienda (no enviar si usa warehouseId)',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiProperty({ example: 'Reposición mensual', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [CreateSupplyOrderProductDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateSupplyOrderProductDto)
  products!: CreateSupplyOrderProductDto[];
}
