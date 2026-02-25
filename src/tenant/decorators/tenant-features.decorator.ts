import { SetMetadata } from '@nestjs/common';
import { TenantFeature } from '@prisma/client';

export const TENANT_FEATURES_KEY = 'tenant_features';

export const RequireTenantFeatures = (...features: Array<TenantFeature | string>) =>
  SetMetadata(TENANT_FEATURES_KEY, features);
