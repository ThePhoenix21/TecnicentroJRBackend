import {
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EstablishmentType } from '@prisma/client';

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
  @ApiProperty({ required: false, enum: EstablishmentType })
  @IsOptional()
  @IsEnum(EstablishmentType)
  destinationType?: EstablishmentType;

  @ApiProperty({ required: false, example: 'uuid-tienda-destino' })
  @IsOptional()
  @IsUUID()
  destinationStoreId?: string;

  @ApiProperty({ required: false, example: 'uuid-almacen-destino' })
  @IsOptional()
  @IsUUID()
  destinationWarehouseId?: string;

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
