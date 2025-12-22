import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class AnalyticsRangeDto {
  @ApiProperty({
    example: '2025-01-01',
    description: 'Fecha inicio (inclusive). Formato ISO (YYYY-MM-DD o ISO completo).',
  })
  @IsNotEmpty()
  @IsDateString()
  from: string;

  @ApiProperty({
    example: '2025-01-31',
    description: 'Fecha fin (inclusive). Formato ISO (YYYY-MM-DD o ISO completo).',
  })
  @IsNotEmpty()
  @IsDateString()
  to: string;
}
