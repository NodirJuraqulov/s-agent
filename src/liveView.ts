import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { getAgentConfig, resolveCameraAuth } from './agentConfig';
import { logger } from './logger';
import { describeError } from './errors';

type CameraType = 'entry' | 'exit';

const CONNECT_TIMEOUT_MS = 8000;

interface ActiveStream {
  abort: () => void;
}

// Kirish/Chiqish uchun alohida yozuv — bittasini to'xtatish ikkinchisiga
// ta'sir qilmaydi (xuddi watchEntry/watchExit kabi mustaqil).
const activeStreams = new Map<CameraType, ActiveStream>();

let socket: Socket | null = null;

function resolveCameraUrl(agentConfig: ReturnType<typeof getAgentConfig>, type: CameraType): string | null {
  return type === 'entry' ? agentConfig.cameraEntryUrl : agentConfig.cameraExitUrl;
}

function emitError(type: CameraType, message: string): void {
  logger.error(`Live view (${type}): ${message}`);
  socket?.emit('live_view:error', { type, message });
}

function stopStream(type: CameraType): void {
  const stream = activeStreams.get(type);
  if (stream) {
    stream.abort();
    activeStreams.delete(type);
  }
}

function stopAllStreams(): void {
  for (const type of [...activeStreams.keys()]) {
    stopStream(type);
  }
}

async function handleLiveViewStart(type: CameraType): Promise<void> {
  if (activeStreams.has(type)) {
    logger.warn(`Live view (${type}): allaqachon faol — takroriy 'live_view:start' e'tiborsiz qoldirildi`);
    return;
  }

  let cameraUrl: string | null;
  let username: string;
  let password: string;
  try {
    const agentConfig = getAgentConfig();
    cameraUrl = resolveCameraUrl(agentConfig, type);
    ({ username, password } = resolveCameraAuth(agentConfig));
  } catch (error) {
    emitError(type, describeError(error));
    return;
  }

  if (!cameraUrl) {
    emitError(type, "Kamera URL hali backend'da sozlanmagan");
    return;
  }

  // 'live_view:stop' javob kelmasdan oldin ham yetib kelishi mumkin —
  // shu holatda javob kelgach oqimni darhol yopamiz (pastga qarang).
  let stopped = false;
  const controller = new AbortController();
  activeStreams.set(type, {
    abort: () => {
      stopped = true;
      controller.abort();
    },
  });

  try {
    const response = await axios.get(cameraUrl, {
      responseType: 'stream',
      signal: controller.signal,
      timeout: CONNECT_TIMEOUT_MS,
      auth: { username, password },
    });

    if (stopped) {
      response.data.destroy();
      return;
    }

    // MUHIM: backend birinchi chunk'dan OLDIN shuni kutadi (10s ack-timeout) —
    // shuning uchun kamera javob bergan zahoti, hech narsani kutmasdan yuboramiz.
    socket?.emit('live_view:started', {
      type,
      content_type: response.headers['content-type'] ?? 'application/octet-stream',
    });

    response.data.on('data', (chunk: Buffer) => {
      socket?.emit('live_view:chunk', { type, chunk });
    });

    response.data.on('error', (error: Error) => {
      activeStreams.delete(type);
      if (stopped) return; // biz o'zimiz to'xtatgan bo'lsak — bu xato emas
      emitError(type, `Kamera oqimida xato: ${describeError(error)}`);
    });

    response.data.on('end', () => {
      activeStreams.delete(type);
      if (stopped) return; // 'live_view:stop' orqali ataylab to'xtatilgan
      emitError(type, 'Kamera oqimi kutilmaganda tugadi');
    });
  } catch (error) {
    activeStreams.delete(type);
    if (stopped) return; // to'xtatish so'rovi ulanish jarayonida kelgan
    emitError(type, `Kameraga ulanib bo'lmadi: ${describeError(error)}`);
  }
}

function handleLiveViewStop(type: CameraType): void {
  stopStream(type);
}

/** Backend bilan Live View uchun Socket.IO ulanishini o'rnatadi. */
export function startLiveView(): void {
  socket = io(config.serverUrl, {
    auth: { agentKey: config.agentApiKey },
  });

  socket.on('connect', () => {
    logger.info('Live view: Socket.IO ulanishi o\'rnatildi');
  });

  socket.on('connect_error', (error: Error) => {
    logger.error(`Live view: Socket.IO ulanish xatosi: ${error.message}`);
  });

  socket.on('disconnect', (reason: string) => {
    logger.warn(`Live view: Socket.IO uzildi (${reason}) — faol kamera oqimlari tozalanmoqda`);
    // Backend o'z tomonidan barcha tomoshabinlarni yakunlaydi (onAgentDisconnected) —
    // biz esa faqat OZ tomonimizdagi ochiq HTTP kamera ulanishlarini yopamiz
    // (xotira/resurs sizib chiqishining oldini olish uchun).
    stopAllStreams();
  });

  socket.on('live_view:start', ({ type }: { type: CameraType }) => {
    handleLiveViewStart(type).catch((error) => {
      emitError(type, `kutilmagan xato: ${describeError(error)}`);
    });
  });

  socket.on('live_view:stop', ({ type }: { type: CameraType }) => {
    handleLiveViewStop(type);
  });
}

/** Socket.IO ulanishini va barcha faol kamera oqimlarini to'xtatadi. */
export function stopLiveView(): void {
  stopAllStreams();
  socket?.disconnect();
  socket = null;
}
