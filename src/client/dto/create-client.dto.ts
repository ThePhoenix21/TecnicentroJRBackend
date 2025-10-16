import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre completo del cliente', example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ 
    description: 'Correo electrónico del cliente', 
    example: 'juan.perez@example.com',
    required: false
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ 
    description: 'Número de teléfono del cliente', 
    example: '+51987654321',
    required: false
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ 
    description: 'Dirección del cliente', 
    example: 'Av. Los Olivos 123',
    required: false
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ 
    description: 'Número de RUC del cliente', 
    example: '20123456781',
    required: false
  })
  @IsString()
  @IsOptional()
  ruc?: string;

  @ApiProperty({ 
    description: 'Número de DNI del cliente', 
    example: '76543210',
    required: false
  })
  @IsString()
  @IsOptional()
  dni?: string;

  @ApiProperty({ 
    description: 'ID del usuario que crea el cliente',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}