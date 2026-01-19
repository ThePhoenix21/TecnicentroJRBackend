import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ChangeEmployedStatusDto {
  @ApiPropertyOptional({ example: 'despido', description: 'Motivo del cambio (despido/reingreso/etc.)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
