import { startAgent, stopAgent } from './agent';
import { processQueue } from './queueProcessor';
import { fetchAgentConfig } from './configFetcher';
import { updateAgentConfig } from './agentConfig';
import { acquireLock, releaseLock } from './lock';
import { logger } from './logger';
import { describeError } from './errors';
import { BACKEND_REQUEST_TIMEOUT_MS } from './server';

// Eng birinchi ish — shu kompyuterda s-agentning boshqa nusxasi (masalan
// PM2 orqali fonda) allaqachon ishlab turgan bo'lsa, darhol to'xtaymiz.
// Bu backend'ga so'rov yuborishdan, oqimlarni ishga tushirishdan OLDIN
// bajariladi — ikkita nusxa bir vaqtda bitta kameraga ulanmasligi uchun.
acquireLock();

// Shutdown paytida mainPromise hali ham ikkita uzoq operatsiyadan birining
// o'rtasida bo'lishi mumkin: camera.ts'ning 5 soniyalik qattiq
// (AbortController) timeout'i, YOKI backend'ga POST so'rovi
// (BACKEND_REQUEST_TIMEOUT_MS, server.ts — postToServer/verifyPlate). Ular
// ketma-ket emas, mustaqil ehtimoliy holatlar, shuning uchun bu xavfsizlik
// chegarasi ENG UZUNIDAN (backend so'rovi) SEZILARLI KATTA bo'lishi SHART —
// aks holda process hali javob/xato kutayotgan (demak hali navbatga
// saqlanmagan) so'rovni yarim yo'lda o'ldirib, rasmni YO'QOTIB QO'YADI (na
// backend'ga yetadi, na queue/ga tushadi). Bu qiymat ATAYLAB
// BACKEND_REQUEST_TIMEOUT_MS'dan import qilib hisoblanadi — ikkalasi
// alohida fayllarda qo'lda yozilsa, kelajakda biri o'zgarib biri
// o'zgarmasdan qolib, xuddi shu muammo qaytishi mumkin edi.
const SHUTDOWN_SAFETY_TIMEOUT_MS = BACKEND_REQUEST_TIMEOUT_MS + 3000;

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

const mainPromise = main().catch((error) => {
  logger.error(`Fatal xato — Local Agent to'xtadi: ${describeError(error)}`);
  releaseLock();
  process.exit(1);
});

// Node'ning o'z tavsiyasi: uncaughtException/unhandledRejection'dan keyin
// dasturni "davom ettirishga" urinish xavfli — jarayon noaniq holatda
// qolgan bo'lishi mumkin. Shu sabab bu yerda graceful shutdown urinilmaydi:
// faqat log yozib, DARHOL chiqib ketamiz — PM2 (yoki boshqa process
// menejeri) bizni toza holatdan qayta ishga tushiradi.
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
  stopAgent(); // barcha oqimlarni (Kirish/Chiqish/Navbat/Konfiguratsiya) va Live View'ni to'xtatadi

  // mainPromise (demak barcha oqimlar) toza tugashini kutamiz, lekin
  // abadiy kutib qolmasligimiz uchun xavfsizlik chegarasi bilan.
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
