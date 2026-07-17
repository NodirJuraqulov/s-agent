import { startAgent, stopAgent } from './agent';
import { processQueue } from './queueProcessor';
import { fetchAgentConfig } from './configFetcher';
import { updateAgentConfig } from './agentConfig';
import { acquireLock, releaseLock } from './lock';
import { logger } from './logger';
import { describeError } from './errors';
import { BACKEND_REQUEST_TIMEOUT_MS } from './server';

acquireLock();

const SHUTDOWN_SAFETY_TIMEOUT_MS = BACKEND_REQUEST_TIMEOUT_MS + 3000;

async function main(): Promise<void> {
  try {
    const agentConfig = await fetchAgentConfig();
    updateAgentConfig(agentConfig);
  } catch (error) {
    logger.error(
      `Backend'dan konfiguratsiya olishda xato: ${describeError(error)} — davriy yangilashda qayta urinilamiz`
    );
  }

  try {
    await processQueue();
  } catch (error) {
    logger.error(`Ishga tushishda navbatni qayta ishlashda xato: ${describeError(error)}`);
  }

  await startAgent();
}

const mainPromise = main().catch((error) => {
  logger.error(`Fatal xato — Local Agent to'xtadi: ${describeError(error)}`);
  releaseLock();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error(`KUTILMAGAN XATO: ${describeError(error)}`);
  releaseLock();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`ISHLANMAGAN PROMISE XATOSI: ${describeError(reason)}`);
  releaseLock();
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Local Agent to'xtatilmoqda (${signal})...`);
  stopAgent();

  const safetyTimeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_SAFETY_TIMEOUT_MS));
  await Promise.race([mainPromise, safetyTimeout]);

  releaseLock();
  logger.info("Local Agent to'xtadi");
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});
