import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadAvatarDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo de imagen para el avatar (JPG, JPEG, PNG)',
  })
  file: Express.Multer.File;

  @ApiProperty({
    description: 'ID del usuario al que se le asignará el avatar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
