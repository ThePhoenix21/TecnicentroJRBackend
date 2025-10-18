import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SaleStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
    @ApiProperty({
        description: 'Nuevo estado de la orden',
        enum: SaleStatus,
        example: 'COMPLETED',
    })
    @IsEnum(SaleStatus, {
        message: 'El estado proporcionado no es válido',
    })
    status: SaleStatus;
}
