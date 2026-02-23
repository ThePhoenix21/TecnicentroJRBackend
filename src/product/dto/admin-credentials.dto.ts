import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class AdminCredentialsDto {
  @ApiProperty({
    description: 'Email del administrador que autoriza la acción',
    example: 'admin@empresa.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password del administrador que autoriza la acción',
    example: '********',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
