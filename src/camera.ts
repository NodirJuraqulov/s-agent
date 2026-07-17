import axios from 'axios';
import type { Readable } from 'stream';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB — buzilgan/cheksiz oqimdan himoya

const JPEG_SOI = Buffer.from([0xff, 0xd8]); // Start Of Image

/**
 * SOI'dan boshlab JPEG segmentlarini (APPn/EXIF, DQT, DHT, SOFn va h.k.)
 * o'z uzunlik maydonlariga qarab o'tkazib yuboradi va SOS (skan boshlanishi,
 * 0xFFDA) markeriga yetgach, haqiqiy skan (rasm) ma'lumoti ichidan
 * (byte-stuffing qoidasiga rioya qilgan holda) haqiqiy EOI'ni qidiradi.
 *
 * MUHIM: agar shunchaki BIRINCHI uchragan 0xFFD9 (EOI) izlansa (avvalgi
 * yondashuv), EXIF/APP1 segmenti ichiga joylashtirilgan thumbnail'ning
 * O'ZINING EOI'si asosiy kadr EOI'sidan OLDIN kelib, kadr chala/buzilgan
 * qaytarilishi mumkin edi (ba'zi kamera firmware'lari shunday qiladi).
 * Segmentlarni uzunligiga qarab o'tkazib yuborish bu holatni to'g'ri
 * hisobga oladi, chunki thumbnail APP1 segmentining ICHIDA, uning
 * uzunlik maydoni bilan birga to'liq qamrab olinadi.
 *
 * Hali to'liq header/skan kelmagan bo'lsa (bufer segment uzunligidan
 * qisqa) — `null` qaytaradi, chaqiruvchi keyingi 'data' chunk kelgach
 * qayta urinadi (avvalgi mantiq bilan bir xil).
 */
function findFrameEnd(buffer: Buffer, start: number): number | null {
  let pos = start + JPEG_SOI.length;
  let sosFound = false;

  while (pos + 2 <= buffer.length) {
    if (buffer[pos] !== 0xff) return null;
    const marker = buffer[pos + 1];

    if (marker === 0xd9) {
      return pos + 2; // SOS'dan oldin EOI — kutilmagan, lekin xavfsiz holat
    }

    // Uzunlik maydonisiz, mustaqil markerlar: SOI, TEM, RSTn
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }

    if (pos + 4 > buffer.length) return null; // uzunlik maydoni hali to'liq kelmagan
    const segmentLength = buffer.readUInt16BE(pos + 2);
    if (segmentLength < 2) return null; // buzilgan segment uzunligi

    pos += 2 + segmentLength;

    if (marker === 0xda) {
      sosFound = true;
      break;
    }
  }

  if (!sosFound || pos > buffer.length) {
    return null;
  }

  // Skan ma'lumoti ichida haqiqiy EOI'ni qidiramiz: 0xFF dan keyin 0x00
  // kelsa — bu byte-stuffing (ichidagi haqiqiy 0xFF bayt, marker emas),
  // shu sabab o'tkazib yuboriladi. RSTn (restart) markerlari ham EOI emas.
  while (pos + 1 < buffer.length) {
    if (buffer[pos] === 0xff) {
      const next = buffer[pos + 1];
      if (next === 0xd9) {
        return pos + 2;
      }
      if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) {
        pos += 2;
        continue;
      }
    }
    pos += 1;
  }

  return null;
}

/**
 * Kelgan baytlar to'plamidan BIRINCHI to'liq JPEG kadrni (SOI...haqiqiy EOI)
 * ajratib oladi. Bu yondashuv universal: kamera oddiy bitta-rasm endpointi
 * (`/snapshot.jpg`) bo'lsin, uzluksiz MJPEG stream (`/video`) bo'lsin —
 * ikkalasida ham JPEG bayt markerlari bir xil, multipart chegara
 * formatini (boundary) bilish yoki taxmin qilish shart emas.
 */
function extractFirstJpeg(buffer: Buffer): Buffer | null {
  const start = buffer.indexOf(JPEG_SOI);
  if (start === -1) return null;

  const end = findFrameEnd(buffer, start);
  if (end === null) return null;

  return buffer.subarray(start, end);
}

/**
 * IP kameradan bitta kadr (JPEG) yuklab oladi (HTTP Basic Auth bilan).
 *
 * Javob STREAM sifatida ochiladi va birinchi to'liq JPEG kadr kelishi bilan
 * ulanish DARHOL yopiladi — javobning to'liq tugashini KUTMAYDI. Shu sabab
 * bu funksiya ham oddiy bitta-rasm endpointlari, ham hech qachon o'z-o'zidan
 * tugamaydigan uzluksiz MJPEG stream endpointlari (masalan `/video`) bilan
 * bab-baravar ishlaydi.
 *
 * AbortController orqali QATTIQ (wall-clock) timeout ham saqlanadi — agar
 * qandaydir sababga ko'ra hech qachon to'liq JPEG kadr yig'ilmasa (masalan
 * kamera butunlay javob bermay qolsa), so'rov abadiy osilib qolmaydi.
 */
export async function captureFrame(cameraUrl: string, username: string, password: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await axios.get<Readable>(cameraUrl, {
      responseType: 'stream',
      signal: controller.signal,
      auth: { username, password },
    });

    return await new Promise<Buffer>((resolve, reject) => {
      const stream = response.data;
      let buffer = Buffer.alloc(0);
      let settled = false;

      const finish = (error: Error | null, frame?: Buffer) => {
        if (settled) return;
        settled = true;
        stream.removeAllListeners('data');
        stream.removeAllListeners('end');
        stream.removeAllListeners('error');
        stream.destroy();
        if (error) reject(error);
        else resolve(frame!);
      };

      stream.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        const frame = extractFirstJpeg(buffer);
        if (frame) {
          finish(null, frame);
          return;
        }

        if (buffer.length > MAX_BUFFER_BYTES) {
          finish(new Error("Kameradan JPEG kadr topilmadi (bufer chegarasidan oshdi)"));
        }
      });

      stream.on('end', () => finish(new Error('Kamera oqimi to\'liq JPEG kadr kelishidan oldin tugadi')));
      stream.on('error', (error: Error) => finish(error));
    });
  } finally {
    clearTimeout(timer);
  }
}
