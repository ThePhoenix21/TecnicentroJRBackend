import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';
import { PaymentType } from '@prisma/client';

export enum CashMovementOperationFilter {
  VENTA = 'venta',
  SERVICIO = 'servicio',
  ANULACION = 'anulacion',
  MANUAL = 'manual',
}

export class ListCashMovementsDto extends BasePaginationDto {
  @ApiPropertyOptional({ enum: PaymentType, example: PaymentType.EFECTIVO })
  @IsOptional()
  @IsEnum(PaymentType)
  payment?: PaymentType;

  @ApiPropertyOptional({ enum: CashMovementOperationFilter, example: CashMovementOperationFilter.VENTA })
  @IsOptional()
  @IsEnum(CashMovementOperationFilter)
  operation?: CashMovementOperationFilter;

  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  clientName?: string;
}
