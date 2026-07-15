import axios from 'axios';
import type { Readable } from 'stream';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB — buzilgan/cheksiz oqimdan himoya

const JPEG_SOI = Buffer.from([0xff, 0xd8]); // Start Of Image
const JPEG_EOI = Buffer.from([0xff, 0xd9]); // End Of Image

/**
 * Kelgan baytlar to'plamidan BIRINCHI to'liq JPEG kadrni (SOI...EOI) ajratib
 * oladi. Bu yondashuv universal: kamera oddiy bitta-rasm endpointi
 * (`/snapshot.jpg`) bo'lsin, uzluksiz MJPEG stream (`/video`) bo'lsin —
 * ikkalasida ham JPEG bayt markerlari bir xil, multipart chegara
 * formatini (boundary) bilish yoki taxmin qilish shart emas.
 */
function extractFirstJpeg(buffer: Buffer): Buffer | null {
  const start = buffer.indexOf(JPEG_SOI);
  if (start === -1) return null;

  const end = buffer.indexOf(JPEG_EOI, start + JPEG_SOI.length);
  if (end === -1) return null;

  return buffer.subarray(start, end + JPEG_EOI.length);
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
