import { logger } from './logger';

/**
 * Backend'dan (`GET /api/agent/config`) olinadigan, runtime davomida
 * o'zgarishi mumkin bo'lgan sozlamalar — kamera URL'lari va shlagbaum
 * konfiguratsiyasi. Bular endi `.env`da emas: Super Admin web panelda
 * o'zgartirsa, s-agent bir daqiqa ichida (`watchConfig`, `agent.ts`)
 * avtomatik yangi qiymatlarni oladi.
 */
export type BarrierMode = 'single' | 'separate';

export interface AgentConfig {
  // Backend'da hali sozlanmagan bo'lishi mumkin (yangi tashkilot) — shu sabab null.
  cameraEntryUrl: string | null;
  cameraExitUrl: string | null;
  barrierEnabled: boolean;
  barrierMode?: BarrierMode;
  barrierEntryPort?: string;
  barrierExitPort?: string;
  barrierOpenSeconds: number;
}

let current: AgentConfig | null = null;

/** Konfiguratsiya hech bo'lmaganda bir marta muvaffaqiyatli yuklanganmi? */
export function hasAgentConfig(): boolean {
  return current !== null;
}

/**
 * Joriy konfiguratsiyani qaytaradi. Hali hech qachon muvaffaqiyatli
 * yuklanmagan bo'lsa xato tashlaydi — chaqiruvchi (watchEntry/watchExit)
 * buni o'zining mavjud try/catch + qayta urinish logikasi orqali tabiiy
 * ravishda kutib turadi.
 */
export function getAgentConfig(): AgentConfig {
  if (!current) {
    throw new Error("Agent konfiguratsiyasi hali backend'dan yuklanmagan");
  }
  return current;
}

/**
 * Berilgan turi (Kirish/Chiqish) uchun qaysi shlagbaum portidan foydalanish
 * kerakligini aniqlaydi. `barrier_mode === "separate"` bo'lsagina Chiqish
 * o'zining alohida portidan foydalanadi — aks holda (`"single"` yoki
 * belgilanmagan) ikkalasi ham Kirish portini ishlatadi (backend'dagi
 * `settingsService.testBarrier` bilan bir xil mantiq).
 */
export function resolveBarrierPort(agentConfig: AgentConfig, type: 'entry' | 'exit'): string | undefined {
  if (agentConfig.barrierMode === 'separate' && type === 'exit') {
    return agentConfig.barrierExitPort;
  }
  return agentConfig.barrierEntryPort;
}

/** Yangi konfiguratsiyani global holatga yozadi va qisqacha xulosani logga chiqaradi. */
export function updateAgentConfig(newConfig: AgentConfig): void {
  current = newConfig;

  const barrierSummary = newConfig.barrierEnabled
    ? `yoqilgan (mode=${newConfig.barrierMode ?? '-'}, entry_port=${newConfig.barrierEntryPort ?? '-'}, exit_port=${newConfig.barrierExitPort ?? '-'}, ${newConfig.barrierOpenSeconds}s)`
    : "o'chirilgan";

  logger.info(
    `Konfiguratsiya backend dan olindi: Kirish kamerasi=${newConfig.cameraEntryUrl ?? 'sozlanmagan'}, ` +
      `Chiqish kamerasi=${newConfig.cameraExitUrl ?? 'sozlanmagan'}, Shlagbaum=${barrierSummary}`
  );
}
