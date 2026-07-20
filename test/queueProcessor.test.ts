import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('queueProcessor', () => {
  let tmpDir: string;
  let postToServerMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 's-agent-queue-'));
    postToServerMock = vi.fn();
    vi.resetModules();
    vi.doMock('../src/server', () => ({
      QUEUE_DIR: tmpDir,
      postToServer: postToServerMock,
    }));
  });

  afterEach(async () => {
    vi.doUnmock('../src/server');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeQueueEntry(filename: string, entry: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(tmpDir, filename), JSON.stringify(entry));
  }

  async function exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  it('muvaffaqiyatsiz sorovda yozuv navbatda qoladi va attempts oshadi', async () => {
    postToServerMock.mockRejectedValue(new Error('network down'));
    await writeQueueEntry('1000-a.json', {
      type: 'entry',
      imageBase64: Buffer.from('fake').toString('base64'),
      capturedAt: new Date().toISOString(),
      attempts: 0,
    });

    const { processQueue } = await import('../src/queueProcessor');
    await processQueue();

    const filePath = path.join(tmpDir, '1000-a.json');
    expect(await exists(filePath)).toBe(true);
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content.attempts).toBe(1);
  });

  it('muvaffaqiyatli qayta yuborilgan yozuv navbatdan ochiriladi', async () => {
    postToServerMock.mockResolvedValue({ detected: true });
    await writeQueueEntry('1000-b.json', {
      type: 'exit',
      imageBase64: Buffer.from('fake').toString('base64'),
      capturedAt: new Date().toISOString(),
      attempts: 2,
    });

    const { processQueue } = await import('../src/queueProcessor');
    await processQueue();

    expect(await exists(path.join(tmpDir, '1000-b.json'))).toBe(false);
  });

  it('buzilgan JSON corrupted/ ga kochiriladi', async () => {
    await fs.writeFile(path.join(tmpDir, '1000-c.json'), '{ not valid json');

    const { processQueue } = await import('../src/queueProcessor');
    await processQueue();

    expect(await exists(path.join(tmpDir, '1000-c.json'))).toBe(false);
    const corruptedContent = await fs.readFile(path.join(tmpDir, 'corrupted', '1000-c.json'), 'utf-8');
    expect(corruptedContent).toBe('{ not valid json');
  });

  it('5 marta muvaffaqiyatsizlikdan song failed/ ga kochiriladi', async () => {
    postToServerMock.mockRejectedValue(new Error('still down'));
    await writeQueueEntry('1000-d.json', {
      type: 'entry',
      imageBase64: Buffer.from('fake').toString('base64'),
      capturedAt: new Date().toISOString(),
      attempts: 4,
    });

    const { processQueue } = await import('../src/queueProcessor');
    await processQueue();

    expect(await exists(path.join(tmpDir, '1000-d.json'))).toBe(false);
    const failedContent = JSON.parse(await fs.readFile(path.join(tmpDir, 'failed', '1000-d.json'), 'utf-8'));
    expect(failedContent.attempts).toBe(5);
  });

  it('30 kundan eski failed/corrupted fayllar tozalanadi', async () => {
    const { cleanupOldQueueFiles } = await import('../src/queueProcessor');

    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const freshTimestamp = Date.now() - 24 * 60 * 60 * 1000;

    const failedDir = path.join(tmpDir, 'failed');
    const corruptedDir = path.join(tmpDir, 'corrupted');
    await fs.mkdir(failedDir, { recursive: true });
    await fs.mkdir(corruptedDir, { recursive: true });

    const oldFailedFile = `${oldTimestamp}-old.json`;
    const freshFailedFile = `${freshTimestamp}-fresh.json`;
    const oldCorruptedFile = `${oldTimestamp}-old.json`;

    await fs.writeFile(path.join(failedDir, oldFailedFile), '{}');
    await fs.writeFile(path.join(failedDir, freshFailedFile), '{}');
    await fs.writeFile(path.join(corruptedDir, oldCorruptedFile), '{}');

    await cleanupOldQueueFiles();

    expect(await exists(path.join(failedDir, oldFailedFile))).toBe(false);
    expect(await exists(path.join(failedDir, freshFailedFile))).toBe(true);
    expect(await exists(path.join(corruptedDir, oldCorruptedFile))).toBe(false);
  });
});
