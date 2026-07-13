import { startAgent, stopAgent } from './agent';
import { processQueue } from './queueProcessor';
import { logger } from './logger';

async function main(): Promise<void> {
  // Asosiy sikllar boshlanishidan oldin — agent o'chirilgan paytda
  // navbatda qolgan so'rovlarni bir marta qayta yuborishga harakat qilamiz.
  try {
    await processQueue();
  } catch (error) {
    logger.error(`Ishga tushishda navbatni qayta ishlashda xato: ${(error as Error).message}`);
  }

  await startAgent();
}

main().catch((error) => {
  logger.error(`Fatal xato — Local Agent to'xtadi: ${(error as Error).message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

process.on('SIGINT', () => {
  logger.info("Local Agent to'xtatilmoqda (SIGINT)...");
  stopAgent();
});
