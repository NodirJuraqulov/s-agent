import { EventEmitter } from 'events';
import { captureFrame } from './camera';
import { detectMotion } from './motion';
import { openBarrier } from './barrier';
import { sendToServer, verifyPlate, sendHeartbeat, EntryResult, ParkingEventType } from './server';
import {
  getQueueSize,
  getFailedQueueSize,
  getCorruptedQueueSize,
  processQueue,
  cleanupOldQueueFiles,
} from './queueProcessor';
import { getAgentConfig, updateAgentConfig, resolveBarrierPort, resolveCameraAuth } from './agentConfig';
import { fetchAgentConfig } from './configFetcher';
import { startLiveView, stopLiveView } from './liveView';
import { config } from './config';
import { logger } from './logger';
import { describeError } from './errors';

const QUEUE_CHECK_INTERVAL_MS = 30000;
const CONFIG_REFRESH_INTERVAL_MS = 60000;
const HEARTBEAT_INTERVAL_MS = 30000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let running = true;

let lastCameraEntryOk: boolean | null = null;
let lastCameraExitOk: boolean | null = null;

function setCameraHealth(type: ParkingEventType, ok: boolean): void {
  if (type === 'entry') {
    lastCameraEntryOk = ok;
  } else {
    lastCameraExitOk = ok;
  }
}

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

const shutdownEmitter = new EventEmitter();
shutdownEmitter.setMaxListeners(0);

function sleep(ms: number): Promise<void> {
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

export function stopAgent(): void {
  running = false;
  stopLiveView();
  shutdownEmitter.emit('shutdown');
}

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

        await sleep(2000);

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

        const result = await sendToServer(type, snapshot, capturedAt);

        if (result.detected) {
          logger.info(`${label}: nomer aniqlandi: ${result.session?.plate_number ?? "noma'lum"}`);
          await confirmAndOpenBarrier(type, latestCameraUrl, result, label);
        } else {
          switch (result.reason) {
            case 'auth_error':
              logger.error(`${label}: Server autentifikatsiya xatosi (401) — Agent API Key ni tekshiring!`);
              break;
            case 'duplicate':
              logger.warn(`${label}: Bu mashina allaqachon stoyankada (409)`);
              break;
            case 'client_error':
              logger.error(`${label}: Server so'rovni rad etdi (qayta urinishga arzimaydigan xato) — texnik xodimga xabar bering`);
              break;
            case 'network_error':
              break;
            case 'ocr_failed':
            default:
              logger.warn(`${label}: nomer aniqlanmadi — operator xabardor`);
              break;
          }
        }

        await sleep(5000);
      }

      await sleep(config.captureIntervalMs);
    } catch (error) {
      logger.error(`${label} xatosi: ${describeError(error)}`);
      await sleep(5000);
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

async function watchHeartbeat(): Promise<void> {
  while (running) {
    try {
      const failedQueueCount = await getFailedQueueSize();
      const corruptedQueueCount = await getCorruptedQueueSize();
      await sendHeartbeat(lastCameraEntryOk, lastCameraExitOk, failedQueueCount, corruptedQueueCount);
    } catch (error) {
      logger.warn(`Heartbeat yuborishda xato: ${describeError(error)}`);
    }
    await sleep(HEARTBEAT_INTERVAL_MS);
  }

  logger.info("Heartbeat kuzatuvi to'xtatildi");
}

async function watchCleanup(): Promise<void> {
  while (running) {
    try {
      await cleanupOldQueueFiles();
    } catch (error) {
      logger.error(`Eski navbat fayllarini tozalashda xato: ${describeError(error)}`);
    }
    await sleep(CLEANUP_INTERVAL_MS);
  }

  logger.info("Navbat tozalash kuzatuvi to'xtatildi");
}

export async function startAgent(): Promise<void> {
  logger.info('AutoStoyanka Local Agent ishga tushdi');
  logger.info(`Server: ${config.serverUrl}`);

  startLiveView();

  await Promise.all([
    watchEntry(),
    watchExit(),
    watchQueue(),
    watchConfig(),
    watchHeartbeat(),
    watchCleanup(),
  ]);

  logger.info("Local Agent to'xtatildi");
}
