import { ApiProperty } from '@nestjs/swagger';
import { ServiceResponseDto } from './service-response.dto';

export class ServiceListResponseDto {
  @ApiProperty({
    description: 'Lista de servicios',
    type: [ServiceResponseDto],
  })
  data: ServiceResponseDto[];

  @ApiProperty({
    description: 'Número total de servicios',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Número de página actual',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Número de elementos por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Número total de páginas',
    example: 5,
  })
  totalPages: number;
}
