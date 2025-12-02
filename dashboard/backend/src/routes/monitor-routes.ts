import path from 'node:path';

import express, { Router } from 'express';

import { MonitoringService } from '../services/monitoring-service';

/**
 * 完全公开的后端监控页面与数据接口（仅内网可访问）
 */
export const createMonitorRoutes = (monitoringService: MonitoringService): Router => {
  const router = Router();
  const publicDir = path.resolve(process.cwd(), 'public');
  const fallbackDir = path.resolve(__dirname, '..', 'public');

  router.use('/assets', express.static(publicDir, { maxAge: '180s' }));
  router.use('/assets', express.static(fallbackDir, { maxAge: '180s' }));

  router.get('/status', async (_req, res, next) => {
    try {
      const snapshot = await monitoringService.getSnapshot();
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/', (_req, res) => {
    const monitorFile = path.join(publicDir, 'monitor.html');
    const fallbackMonitorFile = path.join(fallbackDir, 'monitor.html');

    res.sendFile(monitorFile, (primaryError) => {
      if (!primaryError) {
        return;
      }
      res.sendFile(fallbackMonitorFile, (fallbackError) => {
        if (fallbackError) {
          res
            .status(500)
            .send('监控页面缺失，请确认 public/monitor.html 已包含在部署制品中。');
        }
      });
    });
  });

  return router;
};
