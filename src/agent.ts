import { EventEmitter } from 'events';
import { captureFrame } from './camera';
import { detectMotion } from './motion';
import { openBarrier } from './barrier';
import { sendToServer, verifyPlate, sendHeartbeat, EntryResult, ParkingEventType } from './server';
import { getQueueSize, processQueue } from './queueProcessor';
import { getAgentConfig, updateAgentConfig, resolveBarrierPort, resolveCameraAuth } from './agentConfig';
import { fetchAgentConfig } from './configFetcher';
import { startLiveView, stopLiveView } from './liveView';
import { config } from './config';
import { logger } from './logger';
import { describeError } from './errors';

const QUEUE_CHECK_INTERVAL_MS = 30000;
const CONFIG_REFRESH_INTERVAL_MS = 60000;
const HEARTBEAT_INTERVAL_MS = 30000;

let running = true;


// Har bir turning ENG SO'NGGI captureFrame() urinishi muvaffaqiyatli
// bo'lgan-bo'lmaganini saqlaydi — heartbeat shu qiymatlarni backend'ga
// yuboradi (dastur ishlab tursa ham, kameraning o'zi uzilib qolgan holatni
// aniqlash uchun). `null` — hali birorta ham captureFrame() urinilmagan
// (dastur endigina ishga tushgan).
let lastCameraEntryOk: boolean | null = null;
let lastCameraExitOk: boolean | null = null;

function setCameraHealth(type: ParkingEventType, ok: boolean): void {
  if (type === 'entry') {
    lastCameraEntryOk = ok;
  } else {
    lastCameraExitOk = ok;
  }
}

/**
 * `captureFrame()`ni chaqiradi va natijasini (muvaffaqiyatli/xato) darhol
 * `lastCameraEntryOk`/`lastCameraExitOk` ga yozib qo'yadi — xato bo'lsa
 * qayta tashlaydi, chunki chaqiruvchi (`watchCamera`) buni odatdagidek
 * o'zining tashqi `catch` blokida logga yozib, qayta urinishi kerak.
 */
async function captureFrameTracked(
  type: ParkingEventType,
  cameraUrl: string,
  username: string,
  password: string
): Promise<Buffer> {
  try {
    const frame = await captureFrame(cameraUrl, username, password);
    setCameraHealth(type, true);
    return frame;
  } catch (error) {
    setCameraHealth(type, false);
    throw error;
  }
}

// stopAgent() chaqirilganda BARCHA hozir kutayotgan sleep() lar darhol
// uyg'onishi uchun — aks holda watchConfig (60s) yoki watchQueue (30s) kabi
// oqimlar shutdown paytida hali ham uzoq vaqt "uxlab" yotgan bo'lishi mumkin
// edi, va graceful shutdown haqiqatda tez bo'lmasdi.
const shutdownEmitter = new EventEmitter();
shutdownEmitter.setMaxListeners(0);

function sleep(ms: number): Promise<void> {
  // `running` allaqachon false bo'lsa (masalan xato-blokidagi kutish
  // shutdown signali ALLAQACHON berilgandan KEYIN boshlangan bo'lsa) —
  // "shutdown" hodisasi endi hech qachon qayta kelmaydi, shuning uchun
  // uni kutib o'tirmasdan darhol qaytamiz.
  if (!running) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      shutdownEmitter.off('shutdown', onShutdown);
      resolve();
    }, ms);
    const onShutdown = () => {
      clearTimeout(timer);
      resolve();
    };
    shutdownEmitter.once('shutdown', onShutdown);
  });
}

/** Asosiy sikllarni to'xtatadi (SIGINT/SIGTERM kabi holatlarda graceful shutdown uchun). */
export function stopAgent(): void {
  running = false;
  stopLiveView();
  shutdownEmitter.emit('shutdown');
}

/**
 * Shlagbaumni ochishdan oldingi ikki bosqichli himoya:
 *  1) Birinchi kadrning ishonch darajasi (`confidence`) BARRIER_CONFIDENCE_THRESHOLD
 *     dan past bo'lsa — shlagbaum umuman ochilmaydi (sessiya baribir bazaga
 *     yozilgan, buni backend allaqachon qilib bo'lgan).
 *  2) Yetarli ishonchli bo'lsa ham, ~1 soniyadan keyin YANA bitta mustaqil
 *     kadr olinib, `verifyPlate()` orqali (sessiya YARATMASDAN) tekshiriladi.
 *     Faqat ikkala kadr ham BIR XIL nomerni va yetarli ishonchni bersa,
 *     shlagbaum ochiladi. Bu — backend'ga yuborilayotgan asosiy entry/exit
 *     so'roviga TA'SIR QILMAYDI, faqat lokal shlagbaum qaroriga tegishli.
 */
async function confirmAndOpenBarrier(
  type: ParkingEventType,
  cameraUrl: string,
  firstResult: EntryResult,
  label: string
): Promise<void> {
  const agentConfig = getAgentConfig();
  if (!agentConfig.barrierEnabled) {
    return;
  }

  const firstPlate = firstResult.session?.plate_number;
  const firstConfidence = firstResult.confidence ?? 0;

  if (!firstPlate || firstConfidence < config.barrierConfidenceThreshold) {
    logger.warn(
      `${label}: ishonch darajasi past (${firstConfidence.toFixed(2)} < ${config.barrierConfidenceThreshold}) — shlagbaum ochilmadi, sessiya baribir yozildi`
    );
    return;
  }

  try {
    await sleep(1000);
    const { username, password } = resolveCameraAuth(agentConfig);
    const secondFrame = await captureFrame(cameraUrl, username, password);
    const secondCheck = await verifyPlate(secondFrame);

    if (secondCheck.plate === firstPlate && secondCheck.confidence >= config.barrierConfidenceThreshold) {
      const port = resolveBarrierPort(agentConfig, type);
      await openBarrier(port, agentConfig.barrierOpenSeconds);
    } else {
      logger.warn(
        `${label}: ikkinchi tasdiqlash mos kelmadi (1-nomer=${firstPlate}, 2-nomer=${secondCheck.plate ?? "yo'q"}, ` +
          `ishonch=${secondCheck.confidence.toFixed(2)}) — shlagbaum ochilmadi`
      );
    }
  } catch (error) {
    logger.warn(`${label}: ikkinchi tasdiqlashda xato (${describeError(error)}) — shlagbaum ochilmadi`);
  }
}

/**
 * Bitta kamera oqimini (Kirish yoki Chiqish) kuzatadi. Har bir oqim o'zining
 * previousFrame holatini mustaqil saqlaydi — boshqa oqimga ta'sir qilmaydi.
 * Kamera URL va shlagbaum sozlamalari HAR TICKDA global (backend'dan kelgan,
 * `watchConfig` orqali yangilanadigan) konfiguratsiyadan qayta o'qiladi.
 */
async function watchCamera(
  type: ParkingEventType,
  getCameraUrl: () => string | null,
  label: string
): Promise<void> {
  let previousFrame: Buffer | null = null;

  while (running) {
    try {
      const cameraUrl = getCameraUrl();
      if (!cameraUrl) {
        logger.error(`${label} xatosi: kamera URL hali backend'da sozlanmagan`);
        setCameraHealth(type, false);
        await sleep(5000);
        continue;
      }
      const { username, password } = resolveCameraAuth(getAgentConfig());
      const frame = await captureFrameTracked(type, cameraUrl, username, password);

      const motion = await detectMotion(frame, previousFrame, config.motionThreshold);
      previousFrame = frame;

      if (motion) {
        logger.info(`${label}: harakat aniqlandi!`);

        // 2 soniya kut (mashina to'xtasin)
        await sleep(2000);

        // Yangi rasm ol (to'xtagan holat) — URL yana eng oxirgi holatidan o'qiladi
        const latestCameraUrl = getCameraUrl();
        if (!latestCameraUrl) {
          logger.error(`${label} xatosi: kamera URL hali backend'da sozlanmagan`);
          setCameraHealth(type, false);
          await sleep(5000);
          continue;
        }
        const { username: latestUsername, password: latestPassword } = resolveCameraAuth(getAgentConfig());
        const snapshot = await captureFrameTracked(type, latestCameraUrl, latestUsername, latestPassword);
        const capturedAt = new Date().toISOString();

        // s-backend ga yuborish
        const result = await sendToServer(type, snapshot, capturedAt);

        if (result.detected) {
          logger.info(`${label}: nomer aniqlandi: ${result.session?.plate_number ?? "noma'lum"}`);
          await confirmAndOpenBarrier(type, latestCameraUrl, result, label);
        } else if (!result.queued) {
          // queued=true holatda sendToServer o'zi "navbatga saqlandi" logini allaqachon yozgan
          logger.warn(`${label}: nomer aniqlanmadi — operator xabardor`);
        }

        // 5 soniya kut (bir mashina uchun qayta ishga tushmasin)
        await sleep(5000);
      }

      // Keyingi tekshiruv
      await sleep(config.captureIntervalMs);
    } catch (error) {
      logger.error(`${label} xatosi: ${describeError(error)}`);
      await sleep(5000); // Xato bo'lsa 5s kut, qayta urinish
    }
  }

  logger.info(`${label}: oqim to'xtatildi`);
}

function watchEntry(): Promise<void> {
  return watchCamera('entry', () => getAgentConfig().cameraEntryUrl, 'Kirish');
}

function watchExit(): Promise<void> {
  return watchCamera('exit', () => getAgentConfig().cameraExitUrl, 'Chiqish');
}

/**
 * Kirish/Chiqish oqimlaridan mustaqil: har QUEUE_CHECK_INTERVAL_MS da
 * navbatni (queue/) tekshiradi va bo'sh bo'lmasa qayta yuborishga harakat qiladi.
 */
async function watchQueue(): Promise<void> {
  while (running) {
    await sleep(QUEUE_CHECK_INTERVAL_MS);

    try {
      const queueSize = await getQueueSize();
      if (queueSize > 0) {
        logger.info(`Navbatda ${queueSize} ta yuborilmagan so'rov bor, qayta urinilmoqda...`);
        await processQueue();
      }
    } catch (error) {
      logger.error(`Navbatni tekshirishda xato: ${describeError(error)}`);
    }
  }

  logger.info("Navbat kuzatuvi to'xtatildi");
}

/**
 * Qolgan uchta oqimdan mustaqil: har CONFIG_REFRESH_INTERVAL_MS da backend'dan
 * kamera/shlagbaum konfiguratsiyasini qayta oladi. Xato bo'lsa — eski
 * konfiguratsiya bilan davom etiladi (dastur to'xtamaydi).
 */
async function watchConfig(): Promise<void> {
  while (running) {
    await sleep(CONFIG_REFRESH_INTERVAL_MS);

    try {
      const newConfig = await fetchAgentConfig();
      updateAgentConfig(newConfig);
    } catch (error) {
      logger.error(
        `Konfiguratsiya yangilashda xato: ${describeError(error)} — eski konfiguratsiya bilan davom etilmoqda`
      );
    }
  }

  logger.info("Konfiguratsiya kuzatuvi to'xtatildi");
}

/**
 * Qolgan oqimlardan mustaqil: har HEARTBEAT_INTERVAL_MS da backend'ga
 * "men tirikman" signalini yuboradi — shunda operator/Super Admin panelda
 * s-agent oflayn bo'lib qolganini bilish mumkin bo'ladi. Xato bo'lsa —
 * faqat log yoziladi, tizim to'xtamaydi (heartbeat vaqtincha yetib
 * bormasligi hech qanday funksional oqimga ta'sir qilmasligi kerak).
 */
async function watchHeartbeat(): Promise<void> {
  while (running) {
    try {
      await sendHeartbeat(lastCameraEntryOk, lastCameraExitOk);
    } catch (error) {
      logger.warn(`Heartbeat yuborishda xato: ${describeError(error)}`);
    }
    await sleep(HEARTBEAT_INTERVAL_MS);
  }

  logger.info("Heartbeat kuzatuvi to'xtatildi");
}

export async function startAgent(): Promise<void> {
  logger.info('AutoStoyanka Local Agent ishga tushdi');
  logger.info(`Server: ${config.serverUrl}`);

  // Live View — Socket.IO orqali, o'zining voqea-asosidagi (event-driven)
  // ulanishi bilan, boshqa oqimlardan mustaqil ishlaydi.
  startLiveView();

  // Kirish, Chiqish, Navbat, Konfiguratsiya va Heartbeat oqimlari bir
  // vaqtda, mustaqil ishlaydi
  await Promise.all([watchEntry(), watchExit(), watchQueue(), watchConfig(), watchHeartbeat()]);

  logger.info("Local Agent to'xtatildi");
}
