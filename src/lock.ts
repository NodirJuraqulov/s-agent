import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const LOCK_DIR = path.join(process.cwd(), 'lock');
const LOCK_FILE = path.join(LOCK_DIR, 'agent.lock');

/**
 * Berilgan PID'ga tegishli jarayon hali "jonli"mi — signal yubormasdan
 * tekshiradi (`process.kill(pid, 0)` haqiqiy signal yubormaydi, faqat
 * jarayon mavjudligini/unga ruxsatimiz borligini tekshiradi).
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH — bunday PID bilan jarayon yo'q (o'lgan/eskirgan lock).
    // EPERM — jarayon BOR, lekin unga signal yuborishga ruxsatimiz yo'q —
    // bu holatda ham uni "jonli" deb hisoblaymiz (xavfsizroq taxmin).
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * s-agent shu kompyuterda ikkinchi marta (tasodifan, masalan TeamViewer
 * orqali qo'lda) ishga tushirilishining oldini oladi. `lock/agent.lock`
 * faylida joriy jarayon PID'i saqlanadi:
 *  - agar fayl bor va undagi PID hali jonli bo'lsa — bu ALLAQACHON ishlab
 *    turgan nusxa, shu sabab DARHOL to'xtaymiz (`process.exit(1)`);
 *  - agar fayl bor, lekin undagi PID endi jonli bo'lmasa (eskirgan lock —
 *    masalan avvalgi nusxa kutilmagan tarzda qulagan) — uni almashtirib
 *    davom etamiz.
 */
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

/**
 * Lock faylni o'chiradi — lekin FAQAT agar u haqiqatan ham O'ZIMIZ (joriy
 * PID) tomonidan yozilgan bo'lsa. Bu himoya nozik holatda ham (masalan
 * lock fayl allaqachon boshqa, yangiroq jarayon tomonidan qayta yozilgan
 * bo'lsa) uning lockini bosib ketmasligimizni ta'minlaydi.
 */
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
    // Lock faylni o'chirib bo'lmasa ham jarayon chiqishda davom etadi —
    // bu keyingi ishga tushirishda "eskirgan lock" sifatida to'g'ri
    // aniqlanadi va almashtiriladi.
  }
}
