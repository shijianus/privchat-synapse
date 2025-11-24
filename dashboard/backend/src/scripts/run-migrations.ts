import path from 'path';

import { logger } from '../utils/logger';

/**
 * 迁移脚本占位，提示开发者手动执行 SQL
 */
const main = async (): Promise<void> => {
  const schemaPath = path.resolve(process.cwd(), '../schema/dashboard_schema.sql');
  logger.warn('TODO: 请手动执行数据库脚本: %s', schemaPath);
};

main().catch((error) => {
  logger.error('迁移脚本执行失败: %s', error.message);
  process.exit(1);
});
