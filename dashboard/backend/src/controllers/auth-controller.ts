import { Request, Response } from 'express';

import { AuthService } from '../services/auth-service';
import { AdminRole } from '../types/admin';

/**
 * 管理员认证控制器，处理注册、登录与令牌刷新请求。
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerAdmin = async (req: Request, res: Response): Promise<void> => {
    const actor = req.user
      ? {
          id: req.user.id,
          role: (req.user.roles[0] ?? 'operator') as AdminRole,
        }
      : undefined;
    const admin = await this.authService.registerAdmin(req.body, actor);
    res.status(201).json({
      message: '管理员创建成功',
      user: admin,
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const tokens = await this.authService.login(email, password);
    res.json(tokens);
  };

  refreshToken = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    const result = await this.authService.refreshAccessToken(refreshToken);
    res.json(result);
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    await this.authService.logout(refreshToken);
    res.status(204).send();
  };
}
