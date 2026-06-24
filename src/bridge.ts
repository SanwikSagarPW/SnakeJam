/**
 * Progress Bridge + Analytics Bridge
 *
 * Handles:
 *  1. Reading window.BACKEND_PAYLOAD (blackhole-style) or window.userInfo (legacy)
 *  2. Remapping PascalCase keys (UserID / GameID) -> camelCase (userId / gameId)
 *  3. Persisting progress to localStorage as a fallback
 *  4. Sending analytics events back to the React Native host
 *  5. Posting PROGRESS_UPDATE back to ReactNativeWebView on save
 */

// --- Types -------------------------------------------------------------------

/** Shape injected by the React Native WebView via window.userInfo */
interface RNUserInfo {
  UserID?: string;
  GameID?: string;
  Name?: string;
  highestLevelPlayed?: number;
}

/** Shape injected by the React Native WebView via window.BACKEND_PAYLOAD (blackhole-style) */
interface BackendPayloadRaw {
  userId?: string;
  gameId?: string;
  highestLevelPlayed?: number;
  totalXp?: number;
  totalPlayTime?: number;
  sessionsCount?: number;
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

// --- Extend Window -----------------------------------------------------------

declare global {
  interface Window {
    userInfo?: RNUserInfo;
    BACKEND_PAYLOAD?: BackendPayloadRaw;
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

interface IAnalyticsManager {
  initialize(gameId: string, sessionName: string): void;
  startLevel(levelId: string): void;
  endLevel(levelId: string, successful: boolean, timeTaken: number, xpEarned: number): void;
  recordTask(levelId: string, taskId: string, question: string, correctChoice: string, choiceMade: string, timeTaken: number, xpEarned: number): void;
  addRawMetric(key: string, value: unknown): void;
  submitReport(): void;
}

// --- Constants ---------------------------------------------------------------

const STORAGE_KEY = 'snakejam_progress';

// --- Helpers -----------------------------------------------------------------

/** Read window.BACKEND_PAYLOAD (blackhole-style injection) */
function readBackendPayload(): BackendPayload | null {
  try {
    const bp = window.BACKEND_PAYLOAD;
    if (!bp || !bp.userId || !bp.gameId) return null;
    return {
      userId: bp.userId,
      gameId: bp.gameId,
      highestLevelPlayed: typeof bp.highestLevelPlayed === 'number' ? bp.highestLevelPlayed : 1,
    };
  } catch {
    return null;
  }
}

/** Read window.userInfo (legacy RN injection) */
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

// --- Progress Bridge ---------------------------------------------------------

interface ProgressResult {
  /** 0-indexed level the game should start at */
  startLevelIndex: number;
  payload: BackendPayload | null;
  source: 'webview' | 'localStorage' | 'default';
}

/**
 * Resolves the starting level.
 * Priority: window.BACKEND_PAYLOAD -> window.userInfo -> localStorage -> default
 */
export function resolveProgress(): ProgressResult {
  // Priority 1: window.BACKEND_PAYLOAD (blackhole-style injection)
  const backendPayload = readBackendPayload();
  if (backendPayload) {
    const startLevelIndex = Math.max(0, backendPayload.highestLevelPlayed - 1);
    console.log(
      '[ProgressBridge] BACKEND_PAYLOAD — starting at level ' + backendPayload.highestLevelPlayed + ' (index ' + startLevelIndex + ')',
    );
    saveToStorage(backendPayload);
    return { startLevelIndex, payload: backendPayload, source: 'webview' };
  }

  // Priority 2: window.userInfo (legacy RN injection)
  const userInfo = readUserInfo();
  if (userInfo) {
    const payload = remapToBackendPayload(userInfo);
    if (payload) {
      const startLevelIndex = Math.max(0, payload.highestLevelPlayed - 1);
      console.log(
        '[ProgressBridge] WebView userInfo — starting at level ' + payload.highestLevelPlayed + ' (index ' + startLevelIndex + ')',
      );
      saveToStorage(payload);
      return { startLevelIndex, payload, source: 'webview' };
    }
  }

  // Priority 3: localStorage fallback
  const stored = loadFromStorage();
  if (stored) {
    const startLevelIndex = Math.max(0, stored.highestLevelPlayed - 1);
    console.log(
      '[ProgressBridge] localStorage — starting at level ' + stored.highestLevelPlayed + ' (index ' + startLevelIndex + ')',
    );
    return { startLevelIndex, payload: stored, source: 'localStorage' };
  }

  console.log('[ProgressBridge] No saved progress — starting at level 1 (index 0)');
  return { startLevelIndex: 0, payload: null, source: 'default' };
}

/**
 * Persists the highest level reached and notifies React Native host.
 * `levelIndex` is 0-indexed; stored as 1-indexed.
 */
export function saveProgress(
  levelIndex: number,
  existingPayload: BackendPayload | null,
): void {
  const highestLevelPlayed = levelIndex + 1;
  const payload: BackendPayload = {
    userId: existingPayload?.userId ?? '',
    gameId: existingPayload?.gameId ?? 'snakejam',
    highestLevelPlayed,
  };
  saveToStorage(payload);
  console.log('[ProgressBridge] Saved progress — highestLevelPlayed: ' + highestLevelPlayed);

  // Post PROGRESS_UPDATE back to React Native host (matches blackhole pattern)
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PROGRESS_UPDATE',
        payload,
      }));
    }
  } catch {
    // postMessage unavailable — silent fail
  }
}

// --- Analytics Bridge --------------------------------------------------------

/**
 * Sends an analytics event to the React Native host (if available),
 * and also drives the AnalyticsManager session report.
 */
export function sendAnalytics(
  event: AnalyticsEvent,
  level: number,
  extra: Record<string, unknown> = {},
): void {
  const payload: AnalyticsPayload = {
    event,
    level,
    ...extra,
    timestamp: Date.now(),
  };

  console.log('[Analytics] ' + event, payload);

  const win = window as Window & {
    AnalyticsManager?: new () => IAnalyticsManager;
    __snakejamAM?: IAnalyticsManager;
    __snakejamLevelStart?: number;
  };

  if (!win.__snakejamAM && win.AnalyticsManager) {
    win.__snakejamAM = new win.AnalyticsManager();
  }
  const am = win.__snakejamAM ?? null;

  if (event === 'game_start') {
    if (am) am.initialize('snakejam', 'session_' + Date.now());
    win.__snakejamLevelStart = Date.now();
  }

  if (event === 'level_start') {
    if (am) am.startLevel('level_' + level);
    win.__snakejamLevelStart = Date.now();
  }

  if (event === 'level_complete') {
    if (am) {
      const timeTaken = Date.now() - (win.__snakejamLevelStart ?? Date.now());
      const livesLeft = typeof extra.livesRemaining === 'number' ? extra.livesRemaining : 3;
      const xpEarned = 30 + livesLeft * 10;
      am.endLevel('level_' + level, true, timeTaken, xpEarned);
      am.submitReport();
    }
  }

  if (event === 'level_fail') {
    if (am) {
      const timeTaken = Date.now() - (win.__snakejamLevelStart ?? Date.now());
      am.endLevel('level_' + level, false, timeTaken, 0);
      am.submitReport();
    }
  }

  if (event === 'game_over') {
    if (am) {
      const timeTaken = Date.now() - (win.__snakejamLevelStart ?? Date.now());
      am.endLevel('level_' + level, false, timeTaken, 0);
      am.addRawMetric('game_over', true);
      am.submitReport();
    }
  }

  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  } catch {
    // postMessage unavailable — silent fail
  }
}
