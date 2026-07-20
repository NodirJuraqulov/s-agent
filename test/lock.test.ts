import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('lock', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's-agent-lock-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function lockFilePath(): string {
    return path.join(tmpDir, 'lock', 'agent.lock');
  }

  it('yangi lock muvaffaqiyatli olinadi', async () => {
    const { acquireLock } = await import('../src/lock');

    acquireLock();

    expect(fs.existsSync(lockFilePath())).toBe(true);
    expect(fs.readFileSync(lockFilePath(), 'utf-8')).toBe(String(process.pid));
  });

  it('jonli PID bilan mavjud lock rad etiladi', async () => {
    fs.mkdirSync(path.dirname(lockFilePath()), { recursive: true });
    fs.writeFileSync(lockFilePath(), String(process.pid));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    const { acquireLock } = await import('../src/lock');

    expect(() => acquireLock()).toThrow('process.exit(1)');
    expect(fs.readFileSync(lockFilePath(), 'utf-8')).toBe(String(process.pid));

    exitSpy.mockRestore();
  });

  it("eskirgan (olik PID) lock almashtiriladi", async () => {
    fs.mkdirSync(path.dirname(lockFilePath()), { recursive: true });
    const deadPid = 999999999;
    fs.writeFileSync(lockFilePath(), String(deadPid));

    const { acquireLock } = await import('../src/lock');

    acquireLock();

    expect(fs.readFileSync(lockFilePath(), 'utf-8')).toBe(String(process.pid));
  });
});
