import axios from 'axios';
import type { Readable } from 'stream';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB — buzilgan/cheksiz oqimdan himoya

const JPEG_SOI = Buffer.from([0xff, 0xd8]); // Start Of Image

function findFrameEnd(buffer: Buffer, start: number): number | null {
  let pos = start + JPEG_SOI.length;
  let sosFound = false;

  while (pos + 2 <= buffer.length) {
    if (buffer[pos] !== 0xff) return null;
    const marker = buffer[pos + 1];

    if (marker === 0xd9) {
      return pos + 2;
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }

    if (pos + 4 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(pos + 2);
    if (segmentLength < 2) return null;

    pos += 2 + segmentLength;

    if (marker === 0xda) {
      sosFound = true;
      break;
    }
  }

  if (!sosFound || pos > buffer.length) {
    return null;
  }

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

function extractFirstJpeg(buffer: Buffer): Buffer | null {
  const start = buffer.indexOf(JPEG_SOI);
  if (start === -1) return null;

  const end = findFrameEnd(buffer, start);
  if (end === null) return null;

  return buffer.subarray(start, end);
}

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
