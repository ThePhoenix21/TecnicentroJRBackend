import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CloseCashSessionDto {
  @ApiProperty({
    example: 'usuario@ejemplo.com',
    description: 'Correo electrónico del usuario que cierra la sesión',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'contraseña123',
    description: 'Contraseña del usuario que cierra la sesión',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
