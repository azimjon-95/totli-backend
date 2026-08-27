import type { AdminRoleType } from '../modules/admins/admin.model.js';

export type Permission =
  | 'products:read'
  | 'products:write'
  | 'categories:read'
  | 'categories:write'
  | 'orders:read'
  | 'orders:write'
  | 'orders:status'
  | 'customers:read'
  | 'statistics:read'
  | 'admins:manage'
  | 'settings:write';

const ROLE_PERMISSIONS: Record<AdminRoleType, Permission[]> = {
  SUPER_ADMIN: [
    'products:read',
    'products:write',
    'categories:read',
    'categories:write',
    'orders:read',
    'orders:write',
    'orders:status',
    'customers:read',
    'statistics:read',
    'admins:manage',
    'settings:write',
  ],
  ADMIN: [
    'products:read',
    'products:write',
    'categories:read',
    'categories:write',
    'orders:read',
    'orders:write',
    'orders:status',
    'customers:read',
    'statistics:read',
  ],
  OPERATOR: ['orders:read', 'orders:status', 'customers:read'],
  CONTENT_MANAGER: [
    'products:read',
    'products:write',
    'categories:read',
    'categories:write',
    'settings:write',
  ],
};

export function hasPermission(role: AdminRoleType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: AdminRoleType): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
