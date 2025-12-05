import jwt from 'jsonwebtoken';
import { fetch } from 'undici';

import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface FriendVerificationApiPayload {
  verifier: string;
  target: string;
  hash: string;
}

export interface FriendVerificationApiResponse {
  success: boolean;
  reason?: string;
  revocationWindowEndsAt?: string | null;
}

export interface ReportPayload {
  reporter: string;
  target: string;
  reason: string;
  description?: string;
}

/**
 * 与 Dashboard 后端的 Bot 专用 API 通信客户端
 */
export class DashboardApiService {
  async verifyFriend(payload: FriendVerificationApiPayload): Promise<FriendVerificationApiResponse> {
    const token = this.buildBotToken();

    const response = await fetch(`${config.dashboardApiBaseUrl}/api/v1/bot/2fa/friend-verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response
      .json()
      .catch(() => ({}))) as Partial<FriendVerificationApiResponse> & { message?: string };

    if (!response.ok) {
      const message = data.message ?? response.statusText;
      throw new Error(`Dashboard API 响应 ${response.status}: ${message}`);
    }

    logger.debug('好友验证 API 调用成功: %j', data);
    return data as FriendVerificationApiResponse;
  }

  async submitReport(payload: ReportPayload): Promise<void> {
    const token = this.buildBotToken();

    const response = await fetch(`${config.dashboardApiBaseUrl}/api/v1/bot/reports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      const message = data.message ?? response.statusText;
      throw new Error(`Dashboard API 响应 ${response.status}: ${message}`);
    }
  }

  private buildBotToken(): string {
    return jwt.sign(
      {
        sub: config.botIdentity,
        name: 'matrix-dashboard-bot',
        scopes: ['bot'],
      },
      config.botApiSecret,
      { expiresIn: '5m' }
    );
  }
}
