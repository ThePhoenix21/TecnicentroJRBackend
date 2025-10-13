import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceType, ServiceStatus } from '@prisma/client';

export class CreateServiceDto {
  @ApiProperty({
    description: 'Tipo de servicio',
    enum: ServiceType,
    example: ServiceType.REPAIR,
  })
  @IsEnum(ServiceType)
  @IsNotEmpty()
  type: ServiceType;

  @ApiProperty({
    description: 'Descripción detallada del servicio',
    example: 'Reparación de pantalla rota',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Precio del servicio',
    example: 150.5,
  })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({
    description: 'Indica si el servicio ha sido pagado',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  paid?: boolean;

  @ApiProperty({
    description: 'URLs de las fotos adjuntas al servicio',
    type: [String],
    example: ['https://example.com/photo1.jpg'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiProperty({
    description: 'Estado del servicio',
    enum: ServiceStatus,
    example: ServiceStatus.IN_PROGRESS,
    required: false,
  })
  @IsEnum(ServiceStatus)
  @IsOptional()
  status?: ServiceStatus;
}
