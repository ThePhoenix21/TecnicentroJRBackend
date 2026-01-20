import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class BulkChangeEmployedStatusDto {
  @ApiProperty({
    type: [String],
    description: 'Lista de IDs de empleados a actualizar',
    example: [
      'bbb70730-27fe-4375-9af1-edb778acb6d6',
      'e08296cb-836e-4a45-8d14-635a2e3ccb6b',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    description: 'Nuevo estado a aplicar a todos los empleados',
    example: 'INACTIVE',
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
  })
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status: string;

  @ApiProperty({
    required: false,
    description: 'Motivo opcional (se usa para cierre de historial al pasar a INACTIVE)',
    example: 'cambio_masivo',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
