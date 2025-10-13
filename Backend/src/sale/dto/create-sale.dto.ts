import { IsString, IsUUID, IsInt, Min, IsNumber, MinLength, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SaleStatus } from '@prisma/client';

export class CreateSaleDto {
  @ApiProperty({
    description: 'ID del producto que se está vendiendo',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Cantidad de productos vendidos',
    minimum: 1,
    default: 1,
    example: 2
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({
    description: 'Estado de la venta',
    enum: SaleStatus,
    required: false,
    default: SaleStatus.COMPLETED
  })
  @IsEnum(SaleStatus)
  @IsOptional()
  status?: SaleStatus;
}
