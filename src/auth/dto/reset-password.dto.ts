import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de restablecimiento de contraseña',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'nuevaContraseñaSegura123',
    description: 'Nueva contraseña del usuario (mínimo 8 caracteres)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  newPassword: string;
}