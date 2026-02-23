import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class SetProviderProductsDto {
  @ApiProperty({
    type: [String],
    description: 'Lista de IDs de productos existentes',
    example: [
      'cbe437a1-0b35-46f5-93d4-8ed0c327f61b',
      '9b3c0e40-6f4b-44fe-9c50-e7b0b095ef1f',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  productIds: string[];
}
