import {
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStockTransferItemDto {
  @ApiProperty({ example: 'uuid-producto' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  quantityRequested: number;
}

export class UpdateStockTransferDto {
  @ApiProperty({ required: false, example: 'Notas actualizadas' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, type: [UpdateStockTransferItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateStockTransferItemDto)
  items?: UpdateStockTransferItemDto[];
}
