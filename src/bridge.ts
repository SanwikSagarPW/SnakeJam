/**
 * Progress Bridge + Analytics Bridge
 *
 * Handles:
 *  1. Reading window.userInfo injected by a React Native WebView
 *  2. Remapping PascalCase keys (UserID / GameID) → camelCase (userId / gameId)
 *  3. Persisting progress to localStorage as a fallback
 *  4. Sending analytics events back to the React Native host
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape injected by the React Native WebView */
interface RNUserInfo {
  UserID?: string;
  GameID?: string;
  Name?: string;
  highestLevelPlayed?: number;
}

/** Internal normalised payload used by the bridge */
interface BackendPayload {
  userId: string;
  gameId: string;
  highestLevelPlayed: number;
}

/** Analytics event names */
export type AnalyticsEvent =
  | 'level_start'
  | 'level_complete'
  | 'level_fail'
  | 'game_over'
  | 'game_start';

interface AnalyticsPayload {
  event: AnalyticsEvent;
  level: number;
  [key: string]: unknown;
}

// ─── Extend Window ────────────────────────────────────────────────────────────

declare global {
  interface Window {
    userInfo?: RNUserInfo;
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'snakejam_progress';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readUserInfo(): RNUserInfo | null {
  try {
    return window.userInfo ?? null;
  } catch {
    return null;
  }
}

function remapToBackendPayload(info: RNUserInfo): BackendPayload | null {
  if (!info.UserID || !info.GameID) return null;
  return {
    userId: info.UserID,
    gameId: info.GameID,
    highestLevelPlayed:
      typeof info.highestLevelPlayed === 'number' ? info.highestLevelPlayed : 1,
  };
}

function loadFromStorage(): BackendPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BackendPayload>;
    if (
      typeof parsed.highestLevelPlayed === 'number' &&
      parsed.highestLevelPlayed >= 1
    ) {
      return {
        userId: parsed.userId ?? '',
        gameId: parsed.gameId ?? '',
        highestLevelPlayed: parsed.highestLevelPlayed,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(payload: BackendPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage unavailable — silent fail
  }
}

// ─── Progress Bridge ──────────────────────────────────────────────────────────

interface ProgressResult {
  /** 0-indexed level the game should start at */
  startLevelIndex: number;
  payload: BackendPayload | null;
  source: 'webview' | 'localStorage' | 'default';
}

/**
 * Resolves the starting level.
 * Priority: window.userInfo → localStorage → default (level 1 → index 0)
 */
export function resolveProgress(): ProgressResult {
  const userInfo = readUserInfo();

  if (userInfo) {
    const payload = remapToBackendPayload(userInfo);
    if (payload) {
      // highestLevelPlayed is 1-indexed; convert to 0-indexed start
      const startLevelIndex = Math.max(0, payload.highestLevelPlayed - 1);
      console.log(
        `[ProgressBridge] WebView injection — starting at level ${payload.highestLevelPlayed} (index ${startLevelIndex})`,
      );
      saveToStorage(payload); // keep localStorage in sync
      return { startLevelIndex, payload, source: 'webview' };
    }
  }

  const stored = loadFromStorage();
  if (stored) {
    const startLevelIndex = Math.max(0, stored.highestLevelPlayed - 1);
    console.log(
      `[ProgressBridge] localStorage — starting at level ${stored.highestLevelPlayed} (index ${startLevelIndex})`,
    );
    return { startLevelIndex, payload: stored, source: 'localStorage' };
  }

  console.log('[ProgressBridge] No saved progress — starting at level 1 (index 0)');
  return { startLevelIndex: 0, payload: null, source: 'default' };
}

/**
 * Persists the highest level reached.
 * Call this whenever the player completes a level.
 * `levelIndex` is 0-indexed; stored as 1-indexed.
 */
export function saveProgress(
  levelIndex: number,
  existingPayload: BackendPayload | null,
): void {
  const highestLevelPlayed = levelIndex + 1; // convert to 1-indexed
  const payload: BackendPayload = {
    userId: existingPayload?.userId ?? '',
    gameId: existingPayload?.gameId ?? '',
    highestLevelPlayed,
  };
  saveToStorage(payload);
  console.log(`[ProgressBridge] Saved progress — highestLevelPlayed: ${highestLevelPlayed}`);
}

// ─── Analytics Bridge ─────────────────────────────────────────────────────────

/**
 * Sends an analytics event to the React Native host (if available),
 * and also logs to console for browser testing.
 */
export function sendAnalytics(
  event: AnalyticsEvent,
  level: number,
  extra: Record<string, unknown> = {},
): void {
  const payload: AnalyticsPayload = {
    event,
    level, // 1-indexed display level
    ...extra,
    timestamp: Date.now(),
  };

  console.log(`[Analytics] ${event}`, payload);

  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  } catch {
    // postMessage unavailable — silent fail
  }
}
