import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveSupplyOrderBatchDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ required: false, example: '2026-01-10T00:00:00.000Z' })
  @IsOptional()
  productionDate?: Date;

  @ApiProperty({ required: false, example: '2027-01-10T00:00:00.000Z' })
  @IsOptional()
  expirationDate?: Date;
}

export class ReceiveSupplyOrderProductDto {
  @ApiProperty({ example: '1c5e23f3-253b-4cc3-a902-0efc86ad2766' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ type: [ReceiveSupplyOrderBatchDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplyOrderBatchDto)
  batches?: ReceiveSupplyOrderBatchDto[];
}

export class ReceiveSupplyOrderDto {
  @ApiProperty({ example: 'Guía 001-123', required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ example: 'Recepción parcial', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ReceiveSupplyOrderProductDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplyOrderProductDto)
  products!: ReceiveSupplyOrderProductDto[];
}
