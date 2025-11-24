import { Router } from 'express';

/**
 * 健康检查路由
 */
export const createHealthRoutes = (): Router => {
  const router = Router();

  router.get('/ready', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/live', (_req, res) => {
    res.json({
      status: 'ok',
    });
  });

  return router;
};
