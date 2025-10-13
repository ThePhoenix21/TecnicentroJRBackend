import { IsDate, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Identificador único del usuario',
  })
  @IsUUID()
  id: string;
  //===================================
  @ApiProperty({
    example: 'juanperez@gmail.com',
    description: 'Correo electrónico del usuario',
  })
  @IsEmail()
  email: string;
  //===================================
  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre del usuario',
  })  
  @IsString()
  name: string;
  //===================================
  @ApiProperty({
    example: 'juanperez',
    description: 'Nombre de usuario único',
  })
  @IsString()
  username: string;
  //===================================
  @ApiProperty({
    example: '+346123456789',
    description: 'Teléfono del usuario',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string | null;
//===================================
  @ApiProperty({
    example: true,
    description: 'Indica si el usuario ha sido verificado',
  })
  verified: boolean;
//===================================
  @ApiProperty({
    example: '1990-01-01T00:00:00.000Z',
    description: 'Fecha de creación del usuario',
  })
  @IsDate()
  createdAt: Date;
}