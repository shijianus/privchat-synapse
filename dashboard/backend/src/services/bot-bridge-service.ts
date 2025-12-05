import { config } from '../config/env';

export class BotBridgeService {
  async ensureDirects(users: string[], channelKey?: string): Promise<void> {
    if (!users.length) return;
    const response = await fetch(`${config.botServiceBaseUrl}/webhooks/ensure_dm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.botApiSecret}`,
      },
      body: JSON.stringify({ audience: users, channelKey }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      const message = data.error || response.statusText;
      throw new Error(`ensure_dm failed: ${message}`);
    }
  }
}
