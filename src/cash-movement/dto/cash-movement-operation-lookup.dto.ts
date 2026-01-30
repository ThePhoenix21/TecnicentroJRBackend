import { ApiProperty } from '@nestjs/swagger';

export class CashMovementOperationLookupDto {
  @ApiProperty({ example: 'venta' })
  id!: string;

  @ApiProperty({ example: 'venta' })
  value!: string;
}
