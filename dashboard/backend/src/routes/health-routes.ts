import { Router } from 'express';

import { MonitoringService } from '../services/monitoring-service';
import { createMonitorRoutes } from './monitor-routes';

/**
 * 健康检查路由
 */
export const createHealthRoutes = (monitoringService: MonitoringService): Router => {
  const router = Router();

  router.use('/monitor', createMonitorRoutes(monitoringService));

  router.get('/', async (_req, res, next) => {
    try {
      const summary = await monitoringService.getHealthSummary();
      res.json({
        service: 'Matrix Dashboard API',
        status: summary.status,
        uptime: summary.uptimeSeconds,
        timestamp: summary.timestamp,
        endpoints: {
          health: '/health',
          ready: '/health/ready',
          live: '/health/live',
          monitor: '/monitor',
        },
        services: summary.services,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/ready', async (_req, res, next) => {
    try {
      const summary = await monitoringService.getHealthSummary();
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/live', (_req, res) => {
    res.json({
      status: 'ok',
    });
  });

  router.get('/dashboard', (_req, res) => {
    res.redirect('/monitor');
  });

  return router;
};
