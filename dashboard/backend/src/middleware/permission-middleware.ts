import { NextFunction, Request, Response } from 'express';

import { AdminRole } from '../types/admin';
import { DashboardPermission } from '../types/auth';
import { HttpError } from '../utils/http-error';

type PermissionList = readonly DashboardPermission[];

const normalizePermissions = (permissions: PermissionList): DashboardPermission[] =>
  Array.from(new Set(permissions));

/**
 * 确保当前管理员具备指定的全部权限，否则返回 403。
 */
export const requirePermissions =
  (...permissions: DashboardPermission[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, '未检测到管理员身份'));
      return;
    }

    const required = normalizePermissions(permissions);
    const owned = req.user.permissions ?? [];
    const missing = required.filter((permission) => !owned.includes(permission));

    if (missing.length > 0) {
      next(new HttpError(403, `缺少权限: ${missing.join(', ')}`));
      return;
    }

    next();
  };

/**
 * 确保当前管理员角色满足要求。
 */
export const requireRoles =
  (...roles: AdminRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, '未检测到管理员身份'));
      return;
    }

    const userRoles = req.user.roles || [];
    const hit = roles.some((role) => userRoles.includes(role));

    if (!hit) {
      next(new HttpError(403, '仅限超级管理员执行该操作'));
      return;
    }

    next();
  };
