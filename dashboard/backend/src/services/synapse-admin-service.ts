import { config } from '../config/env';
import { HttpError, createBadRequestError } from '../utils/http-error';
import { logger } from '../utils/logger';

export interface SynapseProvisionRequest {
  readonly username: string;
  readonly password: string;
  readonly displayName?: string;
}

export interface SynapseProvisionResult {
  readonly userId: string;
  readonly requestId?: string;
  readonly raw?: unknown;
}

const MAX_ERROR_SNIPPET_LENGTH = 500;

/**
 * 负责与 Synapse 管理接口交互（仅限内网调用）。
 */
export class SynapseAdminService {
  private getFetch(): (input: string, init?: any) => Promise<any> {
    const fetchImpl = (globalThis as unknown as { fetch?: (input: string, init?: any) => Promise<any> }).fetch;
    if (!fetchImpl) {
      throw new HttpError(500, '当前运行环境缺少 fetch，请升级到 Node.js 18+');
    }
    return fetchImpl;
  }

  async createUser(payload: SynapseProvisionRequest): Promise<SynapseProvisionResult> {
    if (!config.synapse.adminAccessToken) {
      throw createBadRequestError('未配置 Synapse 管理员 Token，无法创建用户');
    }

    const fetchImpl = this.getFetch();
    const baseUrl = config.synapse.adminBaseUrl.replace(/\/$/, '');
    const trimmedUsername = payload.username.replace(/^@/, '').split(':')[0];

    const requestBody = {
      username: trimmedUsername,
      password: payload.password,
      displayname: payload.displayName,
      admin: false,
      deactivated: false,
      inhibit_login: false,
    };

    let response: any;
    try {
      response = await fetchImpl(`${baseUrl}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.synapse.adminAccessToken}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      logger.error('调用 Synapse 创建用户失败: %s', (error as Error).message);
      throw new HttpError(502, '无法连接 Synapse 管理接口', (error as Error).message);
    }

    const rawText = await response.text();
    const parsed = this.safeParseJson(rawText);

    if (!response.ok) {
      const detail =
        (parsed as { error?: string; message?: string } | undefined)?.error ||
        (parsed as { message?: string } | undefined)?.message ||
        response.statusText ||
        'Synapse 返回错误';

      const snippet = rawText.slice(0, MAX_ERROR_SNIPPET_LENGTH);
      logger.warn(
        'Synapse 创建用户失败 (%d): %s — %s',
        response.status,
        detail,
        snippet
      );
      throw new HttpError(response.status, `Synapse 用户创建失败: ${detail}`);
    }

    const userId =
      (parsed as { user_id?: string; userId?: string } | undefined)?.user_id ||
      (parsed as { user_id?: string; userId?: string } | undefined)?.userId ||
      `@${trimmedUsername}:${config.synapse.serverName}`;

    return {
      userId,
      requestId: response.headers.get('X-Request-Id') ?? undefined,
      raw: parsed ?? rawText,
    };
  }

  private safeParseJson(content: string): unknown | null {
    if (!content) {
      return null;
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      logger.debug('无法解析 Synapse 返回的 JSON: %s', (error as Error).message);
      return null;
    }
  }
}
