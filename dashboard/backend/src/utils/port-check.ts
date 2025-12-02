import { request } from 'node:http';
import net from 'node:net';

import { logger } from './logger';

const HEALTH_PATH = '/health/ready';

const isPortFree = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, host);
  });

const isDashboardHealthy = (host: string, port: number): Promise<boolean> => {
  const healthHost = host === '0.0.0.0' ? '127.0.0.1' : host;

  // 对于 0.0.0.0 监听，用 127.0.0.1 探测健康度
  return new Promise((resolve) => {
    const req = request(
      {
        host: healthHost,
        port,
        path: HEALTH_PATH,
        method: 'GET',
        timeout: 1_000,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          resolve(false);
          return;
        }

        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(raw) as { status?: string };
            resolve(body?.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on('error', (error) => {
      logger.warn(
        'Health check on %s:%d failed while probing port: %s',
        healthHost,
        port,
        error.message
      );
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
};

/**
 * 在启动前检查端口占用情况，并给出明确的修复指引
 */
export const assertPortAvailable = async (host: string, port: number): Promise<void> => {
  const free = await isPortFree(host, port);
  if (free) {
    return;
  }

  const healthy = await isDashboardHealthy(host, port);
  if (healthy) {
    throw new Error(
      `Dashboard backend 已在 ${host}:${port} 运行，无需重复启动（如需重启请先停止现有进程）。`
    );
  }

  throw new Error(
    `端口 ${host}:${port} 已被占用，无法启动服务。请停止占用进程或设置 PORT 环境变量更换端口。`
  );
};
