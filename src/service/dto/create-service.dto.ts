import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNumber, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ServiceStatus, ServiceType } from '@prisma/client';

export class CreateServiceDto {
  @ApiProperty({ 
    enum: ServiceType, 
    default: ServiceType.REPAIR,
    description: 'Tipo de servicio',
    example: 'REPAIR'
  })
  @IsEnum(ServiceType, { message: 'Tipo de servicio no válido' })
  type: ServiceType;

  @ApiProperty({ 
    enum: ServiceStatus, 
    default: ServiceStatus.IN_PROGRESS,
    description: 'Estado del servicio',
    example: 'IN_PROGRESS'
  })
  @IsEnum(ServiceStatus, { message: 'Estado de servicio no válido' })
  status: ServiceStatus;

  @ApiProperty({ 
    description: 'Nombre del servicio',
    example: 'Reparación de motor'
  })
  @IsString({ message: 'El nombre debe ser un texto' })
  name: string;

  @ApiProperty({ 
    description: 'Descripción detallada del servicio',
    required: false,
    example: 'Revisión y reparación completa del motor'
  })
  @IsString({ message: 'La descripción debe ser un texto' })
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    type: [String], 
    default: [],
    description: 'URLs de las fotos del servicio',
    required: false,
    example: ['https://ejemplo.com/foto1.jpg', 'https://ejemplo.com/foto2.jpg']
  })
  @IsArray({ message: 'Las URLs de fotos deben ser un arreglo' })
  @IsString({ each: true, message: 'Cada URL debe ser un texto' })
  @IsOptional()
  photoUrls?: string[];

  @ApiProperty({ 
    description: 'Precio del servicio',
    example: 250.50
  })
  @IsNumber({}, { message: 'El precio debe ser un número' })
  price: number;

  @ApiProperty({ 
    description: 'ID de la orden asociada',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID(4, { message: 'El ID de la orden no es válido' })
  orderId: string;
}
