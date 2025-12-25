import { SetMetadata } from '@nestjs/common';

export type RateLimitKeyType = 'ip' | 'user' | 'ip_user';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitOptions {
  rules: RateLimitRule[];
  keyType?: RateLimitKeyType;
  cooldownSeconds?: number;
}

export const RATE_LIMIT_METADATA_KEY = 'rate_limit_options';

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_METADATA_KEY, options);
