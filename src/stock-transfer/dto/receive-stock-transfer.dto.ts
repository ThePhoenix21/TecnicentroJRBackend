import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveStockTransferItemDto {
  @ApiProperty({ example: 'uuid-stock-transfer-product' })
  @IsUUID()
  stockTransferProductId: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantityReceived: number;
}

export class ReceiveStockTransferDto {
  @ApiProperty({ type: [ReceiveStockTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockTransferItemDto)
  items: ReceiveStockTransferItemDto[];

  @ApiProperty({
    required: false,
    description: 'Si es true, cierra la transferencia como PARTIALLY_RECEIVED aunque no todos los items estén completos',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  closePartial?: boolean;
}
