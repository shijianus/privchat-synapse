import { AdminRole } from '../types/admin';
import { DashboardPermission } from '../types/auth';

const allPermissions: DashboardPermission[] = [
  'user:read',
  'user:write',
  'user:ban:manage',
  'appeal:read',
  'appeal:process',
  'media:read',
  'media:policy:manage',
  'registration:read',
  'registration:approve',
  'registration:reject',
  'system:config',
  'system:monitoring',
  'system:audit',
];

const adminPermissions: DashboardPermission[] = allPermissions.filter(
  (permission) => permission !== 'system:config'
);

const moderatorPermissions: DashboardPermission[] = [
  'user:read',
  'user:write',
  'user:ban:manage',
  'appeal:read',
  'appeal:process',
  'media:read',
  'registration:read',
  'registration:approve',
  'registration:reject',
  'system:monitoring',
];

const operatorPermissions: DashboardPermission[] = [
  'user:read',
  'appeal:read',
  'media:read',
  'registration:read',
  'system:monitoring',
];

const viewerPermissions: DashboardPermission[] = ['system:monitoring'];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly DashboardPermission[]> = {
  super_admin: allPermissions,
  admin: adminPermissions,
  moderator: moderatorPermissions,
  operator: operatorPermissions,
  viewer: viewerPermissions,
};

export const getPermissionsForRole = (role: AdminRole): DashboardPermission[] =>
  [...ROLE_PERMISSIONS[role]];
