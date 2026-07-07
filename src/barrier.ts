import { SerialPort } from 'serialport';
import { config } from './config';
import { logger } from './logger';

let port: SerialPort | null = null;

/**
 * Shlagbaum relay moduli bilan seriya portni ochadi.
 * Port ko'rsatilmagan yoki ulanmagan bo'lsa — log yozib, jim davom etadi.
 */
export function initBarrier(barrierPort: string): void {
  if (!barrierPort) {
    logger.info("Shlagbaum sozlanmagan (BARRIER_PORT bo'sh) — shlagbaum funksiyasi o'chirilgan");
    return;
  }

  try {
    port = new SerialPort({ path: barrierPort, baudRate: 9600, autoOpen: true }, (err) => {
      if (err) {
        logger.error(`Shlagbaum portini ochib bo'lmadi (${barrierPort}): ${err.message}`);
        port = null;
      }
    });

    port.on('error', (err) => {
      logger.error(`Shlagbaum port xatosi: ${err.message}`);
    });
  } catch (err) {
    logger.error(`Shlagbaum ulanmadi: ${(err as Error).message}`);
    port = null;
  }
}

/** Shlagbaumga signal beradi, BARRIER_OPEN_SECONDS kutadi, so'ng yopadi. */
export async function openBarrier(openSeconds: number = config.barrierOpenSeconds): Promise<void> {
  if (!port || !port.isOpen) {
    logger.warn('Shlagbaum ulanmagan — signal yuborilmadi, jarayon davom etmoqda');
    return;
  }

  try {
    await writeToPort(Buffer.from([0x01]));
    logger.info('Shlagbaum ochildi');

    await sleep(openSeconds * 1000);

    await writeToPort(Buffer.from([0x00]));
    logger.info('Shlagbaum yopildi');
  } catch (err) {
    logger.error(`Shlagbaumga signal yuborishda xato: ${(err as Error).message}`);
  }
}

function writeToPort(data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error('Port ochilmagan'));
      return;
    }
    port.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
