import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class HardDeleteOrdersByDateRangeDto {
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: '2026-01-31T23:59:59.999Z' })
  @IsDateString()
  toDate!: string;

  @ApiProperty({ example: 'admin@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MiPasswordSegura123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ required: false, example: 'Limpieza por error de carga masiva' })
  @IsOptional()
  @IsString()
  reason?: string;
}