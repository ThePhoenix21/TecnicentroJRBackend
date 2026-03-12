import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnnulStockTransferDto {
  @ApiProperty({ example: 'Error en la solicitud, productos incorrectos' })
  @IsString()
  @IsNotEmpty()
  cancelReason: string;
}
