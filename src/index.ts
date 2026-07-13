import { startAgent, stopAgent } from './agent';
import { processQueue } from './queueProcessor';
import { fetchAgentConfig } from './configFetcher';
import { updateAgentConfig } from './agentConfig';
import { logger } from './logger';
import { describeError } from './errors';

async function main(): Promise<void> {
  // Asosiy oqimlar (Kirish/Chiqish/Navbat/Konfiguratsiya) boshlanishidan oldin
  // backend'dan kamera/shlagbaum konfiguratsiyasini bir marta olishga harakat
  // qilamiz. Muvaffaqiyatsiz bo'lsa dastur to'xtamaydi — davriy yangilash
  // (watchConfig, agent.ts) keyinroq qayta urinadi.
  try {
    const agentConfig = await fetchAgentConfig();
    updateAgentConfig(agentConfig);
  } catch (error) {
    logger.error(
      `Backend'dan konfiguratsiya olishda xato: ${describeError(error)} — davriy yangilashda qayta urinilamiz`
    );
  }

  // Asosiy sikllar boshlanishidan oldin — agent o'chirilgan paytda
  // navbatda qolgan so'rovlarni bir marta qayta yuborishga harakat qilamiz.
  try {
    await processQueue();
  } catch (error) {
    logger.error(`Ishga tushishda navbatni qayta ishlashda xato: ${describeError(error)}`);
  }

  await startAgent();
}

main().catch((error) => {
  logger.error(`Fatal xato — Local Agent to'xtadi: ${describeError(error)}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${describeError(reason)}`);
});

process.on('SIGINT', () => {
  logger.info("Local Agent to'xtatilmoqda (SIGINT)...");
  stopAgent();
});
