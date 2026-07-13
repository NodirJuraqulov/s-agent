import fs from 'fs/promises';
import path from 'path';
import { postToServer, QUEUE_DIR, ParkingEventType } from './server';
import { logger } from './logger';
import { describeError } from './errors';

const FAILED_DIR = path.join(QUEUE_DIR, 'failed');
const MAX_ATTEMPTS = 5;

interface QueueEntry {
  type: ParkingEventType;
  imageBase64: string;
  capturedAt: string;
  attempts: number;
}

async function listQueueFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(QUEUE_DIR);
    // Fayl nomi <epochMs>-<uuid>.json ko'rinishida — lexicographic sort
    // eng eski so'rovni birinchi qo'yadi.
    return files.filter((f) => f.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/** Navbatda kutayotgan (hali yuborilmagan) so'rovlar sonini qaytaradi. */
export async function getQueueSize(): Promise<number> {
  const files = await listQueueFiles();
  return files.length;
}

async function moveToFailed(filename: string, entry: QueueEntry): Promise<void> {
  await fs.mkdir(FAILED_DIR, { recursive: true });
  await fs.writeFile(path.join(FAILED_DIR, filename), JSON.stringify(entry));
  await fs.unlink(path.join(QUEUE_DIR, filename));
}

async function processQueueFile(filename: string): Promise<void> {
  const filePath = path.join(QUEUE_DIR, filename);

  let entry: QueueEntry;
  try {
    entry = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (error) {
    logger.error(`Navbat faylini o'qib bo'lmadi (${filename}): ${describeError(error)}`);
    return;
  }

  const label = entry.type === 'entry' ? 'Kirish' : 'Chiqish';
  const image = Buffer.from(entry.imageBase64, 'base64');

  try {
    await postToServer(entry.type, image, entry.capturedAt);
    await fs.unlink(filePath);
    logger.info(`Navbatdan yuborildi: ${filename}`);
  } catch (error) {
    entry.attempts += 1;

    if (entry.attempts >= MAX_ATTEMPTS) {
      await moveToFailed(filename, entry);
      logger.warn(`Navbatdan chiqarib tashlandi (${MAX_ATTEMPTS} marta urinildi): ${filename}`);
      return;
    }

    await fs.writeFile(filePath, JSON.stringify(entry));
    logger.warn(
      `[${label}] Navbatdan qayta yuborishda xato (urinish ${entry.attempts}/${MAX_ATTEMPTS}): ${describeError(error)}`
    );
  }
}

/**
 * Navbatdagi barcha so'rovlarni eng eskisidan boshlab ketma-ket qayta
 * yuborishga harakat qiladi. Muvaffaqiyatli bo'lsa fayl o'chiriladi;
 * muvaffaqiyatsiz bo'lsa `attempts` oshirilib fayl saqlanadi (5 martadan
 * keyin `queue/failed/`ga ko'chiriladi).
 */
export async function processQueue(): Promise<void> {
  const files = await listQueueFiles();

  for (const filename of files) {
    await processQueueFile(filename);
  }
}
