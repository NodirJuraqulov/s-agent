import axios from 'axios';
import { config } from './config';

const REQUEST_TIMEOUT_MS = 5000;

/**
 * IP kameradan bitta kadr (JPEG) yuklab oladi (HTTP Basic Auth bilan).
 *
 * AbortController orqali QATTIQ (wall-clock) timeout ishlatiladi — axios'ning
 * o'zining `timeout` optsiyasi Node http adapterida "idle" (ma'lumot kelmay
 * qolgan) vaqtni o'lchaydi, ya'ni server uzluksiz ma'lumot yuborib turgan
 * MJPEG stream kabi endpointlarda (masalan noto'g'ri sozlangan `/video`)
 * hech qachon ishga tushmay, so'rov abadiy osilib qolishi mumkin edi.
 */
export async function captureFrame(cameraUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await axios.get<ArrayBuffer>(cameraUrl, {
      responseType: 'arraybuffer',
      signal: controller.signal,
      auth: {
        username: config.cameraUsername,
        password: config.cameraPassword,
      },
    });
    return Buffer.from(response.data);
  } finally {
    clearTimeout(timer);
  }
}
