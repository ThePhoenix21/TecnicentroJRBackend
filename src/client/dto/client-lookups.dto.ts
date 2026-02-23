import { ApiProperty } from '@nestjs/swagger';

export class ClientLookupNameDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: 'Juan Pérez', nullable: true })
  name!: string | null;
}

export class ClientLookupPhoneDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: '987654321', nullable: true })
  phone!: string | null;
}

export class ClientLookupDniDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: '76543210' })
  dni!: string;
}
