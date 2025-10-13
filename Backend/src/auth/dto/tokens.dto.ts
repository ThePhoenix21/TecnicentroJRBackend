import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Expiration time of the access token in seconds' })
  expiresIn: number;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  refreshToken: string;
}
