import { startAgent, stopAgent } from './agent';
import { logger } from './logger';

startAgent();

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

process.on('SIGINT', () => {
  logger.info("Local Agent to'xtatilmoqda (SIGINT)...");
  stopAgent();
});
