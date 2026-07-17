import fs from 'fs/promises';
import path from 'path';
import { postToServer, QUEUE_DIR, ParkingEventType } from './server';
import { logger } from './logger';
import { describeError } from './errors';

const FAILED_DIR = path.join(QUEUE_DIR, 'failed');
const CORRUPTED_DIR = path.join(QUEUE_DIR, 'corrupted');
const MAX_ATTEMPTS = 5;
const MAX_FILE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface QueueEntry {
  type: ParkingEventType;
  imageBase64: string;
  capturedAt: string;
  attempts: number;
}

async function listQueueFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(QUEUE_DIR);
    return files.filter((f) => f.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function getQueueSize(): Promise<number> {
  const files = await listQueueFiles();
  return files.length;
}

async function countJsonFiles(dir: string): Promise<number> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

export async function getFailedQueueSize(): Promise<number> {
  return countJsonFiles(FAILED_DIR);
}

export async function getCorruptedQueueSize(): Promise<number> {
  return countJsonFiles(CORRUPTED_DIR);
}

async function moveToFailed(filename: string, entry: QueueEntry): Promise<void> {
  await fs.mkdir(FAILED_DIR, { recursive: true });
  await fs.writeFile(path.join(FAILED_DIR, filename), JSON.stringify(entry));
  await fs.unlink(path.join(QUEUE_DIR, filename));
}

async function moveToCorrupted(filename: string): Promise<void> {
  await fs.mkdir(CORRUPTED_DIR, { recursive: true });
  await fs.rename(path.join(QUEUE_DIR, filename), path.join(CORRUPTED_DIR, filename));
}

async function processQueueFile(filename: string): Promise<void> {
  const filePath = path.join(QUEUE_DIR, filename);

  let entry: QueueEntry;
  try {
    entry = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (error) {
    logger.error(
      `Navbat fayli buzilgan, o'qib bo'lmadi (${filename}): ${describeError(error)} — corrupted/ ga ko'chirilmoqda`
    );
    try {
      await moveToCorrupted(filename);
    } catch (moveError) {
      logger.error(`Buzilgan faylni corrupted/ ga ko'chirishda xato (${filename}): ${describeError(moveError)}`);
    }
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

export async function processQueue(): Promise<void> {
  const files = await listQueueFiles();

  for (const filename of files) {
    await processQueueFile(filename);
  }
}

function extractTimestampFromFilename(filename: string): number | null {
  const match = filename.match(/^(\d+)-/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function cleanupDir(dir: string): Promise<number> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  const now = Date.now();
  let removedCount = 0;

  for (const filename of files) {
    if (!filename.endsWith('.json')) continue;

    const filePath = path.join(dir, filename);
    const timestamp = extractTimestampFromFilename(filename);
    const ageMs = timestamp !== null ? now - timestamp : now - (await fs.stat(filePath)).mtimeMs;

    if (ageMs > MAX_FILE_AGE_MS) {
      await fs.unlink(filePath);
      removedCount += 1;
    }
  }

  return removedCount;
}

export async function cleanupOldQueueFiles(): Promise<void> {
  const failedRemoved = await cleanupDir(FAILED_DIR);
  const corruptedRemoved = await cleanupDir(CORRUPTED_DIR);

  if (failedRemoved > 0 || corruptedRemoved > 0) {
    logger.info(`Eski navbat fayllari tozalandi: failed=${failedRemoved}, corrupted=${corruptedRemoved}`);
  }
}
