import { logger } from '../utils/logger';

/**
 * 初始化种子数据脚本占位
 */
const main = async (): Promise<void> => {
  logger.warn('TODO: 尚未定义 Dashboard 种子数据脚本');
};

main().catch((error) => {
  logger.error('种子脚本执行失败: %s', error.message);
  process.exit(1);
});
