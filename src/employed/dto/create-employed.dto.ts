import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEmployedDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  document!: string;

  @ApiPropertyOptional({ example: '+51 999 999 999' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'juan@empresa.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Mecánico' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'e7291ff1-ff95-4031-b58c-69f02a67e002', description: 'Asignar a tienda (mutuamente exclusivo con warehouseId)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ example: '9d9f1a9d-1111-2222-3333-444444444444', description: 'Asignar a almacén (mutuamente exclusivo con storeId)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'OPERARIO' })
  @IsOptional()
  @IsString()
  assignmentRole?: string;
}
