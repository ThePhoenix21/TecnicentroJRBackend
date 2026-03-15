import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstablishmentType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

enum TransferType {
  REQUEST = 'REQUEST',
  SEND = 'SEND',
}

export class CreateStockTransferItemDto {
  @ApiProperty({ example: 'uuid-producto' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  quantityRequested: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ 
    enum: TransferType,
    description: 'REQUEST: origen solicita a destino (destino entrega). SEND: origen envía a destino (origen entrega)'
  })
  @IsEnum(TransferType)
  transferType: TransferType;

  @ApiProperty({ enum: EstablishmentType })
  @IsEnum(EstablishmentType)
  originType: EstablishmentType;

  @ApiProperty({ required: false, example: 'uuid-tienda-origen' })
  @IsOptional()
  @IsUUID()
  originStoreId?: string;

  @ApiProperty({ required: false, example: 'uuid-almacen-origen' })
  @IsOptional()
  @IsUUID()
  originWarehouseId?: string;

  @ApiProperty({ enum: EstablishmentType })
  @IsEnum(EstablishmentType)
  destinationType: EstablishmentType;

  @ApiProperty({ required: false, example: 'uuid-tienda-destino' })
  @IsOptional()
  @IsUUID()
  destinationStoreId?: string;

  @ApiProperty({ required: false, example: 'uuid-almacen-destino' })
  @IsOptional()
  @IsUUID()
  destinationWarehouseId?: string;

  @ApiProperty({ required: false, example: 'Transferencia mensual de reposición' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateStockTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items: CreateStockTransferItemDto[];
}
