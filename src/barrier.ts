import { SerialPort } from 'serialport';
import { logger } from './logger';
import { describeError } from './errors';

// Port yo'liga qarab ochilgan portlarni keshlaymiz — Kirish va Chiqish
// alohida-alohida (yoki bir xil) portda bo'lishi mumkin, konfiguratsiya
// backend'dan dinamik kelgani uchun portni har safar ochib o'tirmaymiz.
const openPorts = new Map<string, SerialPort>();

function getOrOpenPort(portPath: string): SerialPort | null {
  const existing = openPorts.get(portPath);
  if (existing) {
    return existing;
  }

  try {
    const port = new SerialPort({ path: portPath, baudRate: 9600, autoOpen: true }, (err) => {
      if (err) {
        logger.error(`Shlagbaum portini ochib bo'lmadi (${portPath}): ${err.message}`);
        openPorts.delete(portPath);
      }
    });

    port.on('error', (err) => {
      logger.error(`Shlagbaum port xatosi (${portPath}): ${err.message}`);
    });

    openPorts.set(portPath, port);
    return port;
  } catch (err) {
    logger.error(`Shlagbaum ulanmadi (${portPath}): ${describeError(err)}`);
    return null;
  }
}

/**
 * Shlagbaumga signal beradi: portPath ochiladi (yoki keshdan olinadi),
 * openSeconds soniya ochiq turadi, so'ng yopiladi. Port ko'rsatilmagan yoki
 * ulanmagan bo'lsa — log yozib, jim davom etadi (dastur to'xtamaydi).
 */
export async function openBarrier(portPath: string | undefined, openSeconds: number): Promise<void> {
  if (!portPath) {
    logger.warn('Shlagbaum porti sozlanmagan — signal yuborilmadi, jarayon davom etmoqda');
    return;
  }

  const port = getOrOpenPort(portPath);
  if (!port || !port.isOpen) {
    logger.warn(`Shlagbaum (${portPath}) ulanmagan — signal yuborilmadi, jarayon davom etmoqda`);
    return;
  }

  try {
    await writeToPort(port, Buffer.from([0x01]));
    logger.info(`Shlagbaum ochildi (${portPath})`);

    await sleep(openSeconds * 1000);

    await writeToPort(port, Buffer.from([0x00]));
    logger.info(`Shlagbaum yopildi (${portPath})`);
  } catch (err) {
    logger.error(`Shlagbaumga signal yuborishda xato (${portPath}): ${describeError(err)}`);
  }
}

function writeToPort(port: SerialPort, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
