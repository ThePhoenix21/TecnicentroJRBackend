import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { StockTransferStatus } from '@prisma/client';

export class ListStockTransfersDto {
  @ApiProperty({ required: false, description: 'ID de la tienda del establecimiento (requiere uno: storeId o warehouseId)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiProperty({ required: false, description: 'ID del almacén del establecimiento (requiere uno: storeId o warehouseId)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiProperty({ required: false, enum: StockTransferStatus })
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;

  @ApiProperty({ required: false, example: 'TRF-' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiProperty({ required: false, example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
