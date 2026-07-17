import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const LOCK_DIR = path.join(process.cwd(), 'lock');
const LOCK_FILE = path.join(LOCK_DIR, 'agent.lock');

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function acquireLock(): void {
  fs.mkdirSync(LOCK_DIR, { recursive: true });

  if (fs.existsSync(LOCK_FILE)) {
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    const existingPid = Number(raw);

    if (Number.isInteger(existingPid) && existingPid > 0 && isProcessAlive(existingPid)) {
      logger.error(`s-agent ALLAQACHON ishlab turibdi (PID: ${existingPid}) — bu nusxa to'xtatilmoqda`);
      process.exit(1);
    }

    logger.warn(`Eskirgan lock fayl topildi (PID: ${raw || "noma'lum"} — jarayon mavjud emas), almashtirilmoqda`);
  }

  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

export function releaseLock(): void {
  try {
    if (!fs.existsSync(LOCK_FILE)) {
      return;
    }
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    if (Number(raw) === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {

  }
}
