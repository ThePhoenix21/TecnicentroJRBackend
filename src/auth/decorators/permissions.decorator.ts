import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_PERMISSIONS_KEY = 'any_permissions';
export const RequireAnyPermissions = (...permissions: PermissionKey[]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);
