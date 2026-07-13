(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.AnalyticsManager = factory());
})(this, (function () { 'use strict';

  /**
   * AnalyticsManager - Tracks game analytics and submits to React Native WebView
   */
  class AnalyticsManager {
    constructor() {
      if (AnalyticsManager.instance) {
        return AnalyticsManager.instance;
      }

      this._isInitialized = false;
      this._gameId = '';
      this._sessionName = '';
      
      this._reportData = {
        gameId: '',
        name: '',
        xpEarnedTotal: 0,
        highestLevelPlayed: 0,
        rawData: [],
        diagnostics: {
          levels: []
        }
      };

      AnalyticsManager.instance = this;
    }
    
    static getInstance() {
      if (!AnalyticsManager.instance) {
        AnalyticsManager.instance = new AnalyticsManager();
      }
      return AnalyticsManager.instance;
    }
    
    /**
     * Initialize the analytics session
     * @param {string} gameId - Unique game identifier
     * @param {string} sessionName - Session/player identifier
     */
    initialize(gameId, sessionName) {
      this._gameId = gameId;
      this._sessionName = sessionName;
      
      this._reportData.gameId = gameId;
      this._reportData.name = sessionName;
      this._reportData.highestLevelPlayed = 0;
      this._reportData.diagnostics.levels = [];
      this._reportData.rawData = [];
      this._reportData.xpEarnedTotal = 0;
      
      this._isInitialized = true;
      console.log(`[Analytics] Initialized for: ${gameId}`);
    }
    
    /**
     * Add a generic metric (FPS, Latency, etc)
     * @param {string} key - Metric name
     * @param {string|number} value - Metric value
     */
    addRawMetric(key, value) {
      if (!this._isInitialized) {
        console.warn('[Analytics] Not initialized');
        return;
      }
      
      this._reportData.rawData.push({ key, value: String(value) });
    }
    
    /**
     * Start tracking a new level
     * @param {string|number} levelId - Unique level identifier
     */
    startLevel(levelId) {
      if (!this._isInitialized) {
        console.warn('[Analytics] Not initialized');
        return;
      }
      
      // Normalize to string to allow matching 1 vs '1'
      const idString = String(levelId);

      const levelEntry = {
        levelId: idString,
        successful: false,
        timeTaken: 0,
        timeDirection: false,
        xpEarned: 0,
        tasks: []
      };
      
      this._reportData.diagnostics.levels.push(levelEntry);
      this._updateHighestLevel(idString);
    }
    
    /**
     * Complete a level and update totals
     * @param {string|number} levelId - Level identifier
     * @param {boolean} successful - Whether level was completed successfully
     * @param {number} timeTakenMs - Time taken in milliseconds
     * @param {number} xp - XP earned for this level
     */
    endLevel(levelId, successful, timeTakenMs, xp) {
      const level = this._getLevelById(String(levelId));
      
      if (level) {
        level.successful = successful;
        level.timeTaken = timeTakenMs;
        level.xpEarned = xp;
        
        // Update global session totals
        this._reportData.xpEarnedTotal += xp;
      } else {
        console.warn(`[Analytics] End Level called for unknown level: ${levelId}`);
      }
    }
    
    /**
     * Record a specific user action/task within a level
     * @param {string|number} levelId - Level identifier
     * @param {string} taskId - Task identifier
     * @param {string} question - Question text
     * @param {string} correctChoice - Correct answer
     * @param {string} choiceMade - User's answer
     * @param {number} timeMs - Time taken in milliseconds
     * @param {number} xp - XP earned for this task
     */
    recordTask(levelId, taskId, question, correctChoice, choiceMade, timeMs, xp) {
      const level = this._getLevelById(String(levelId));
      
      if (level) {
        const isSuccessful = (correctChoice === choiceMade);
        const taskData = {
          taskId,
          question,
          options: '[]',
          correctChoice,
          choiceMade,
          successful: isSuccessful,
          timeTaken: timeMs,
          xpEarned: xp
        };
        
        level.tasks.push(taskData);
      } else {
        console.warn(`[Analytics] Record Task called for unknown level: ${levelId}`);
      }
    }
    
    /**
     * Submit the final report to React Native WebView
     */
    submitReport() {
      if (!this._isInitialized) {
        console.error('[Analytics] Attempted to submit without initialization.');
        return;
      }
      // Build canonical payload
      const payload = JSON.parse(JSON.stringify(this._reportData));
      // ensure canonical fields expected by hosts
      if (!payload.sessionId) payload.sessionId = (Date.now() + '-' + Math.random().toString(36));
      if (!payload.timestamp) payload.timestamp = new Date().toISOString();
      // map existing fields to common names
      payload.xpEarned = payload.xpEarned || payload.xpEarnedTotal || 0;
      payload.xpTotal = payload.xpTotal || payload.xpEarnedTotal || 0;
      payload.bestXp = payload.bestXp || payload.xpEarnedTotal || 0;

      // Log complete payload for debugging
      console.log('[Analytics] Full Payload:', JSON.stringify(payload, null, 2));

      // Try delivery via several bridges, best-effort. If window is not present (test/node), just return payload
      if (typeof window === 'undefined') {
        return payload;
      }

      // helpers for persistence/queueing
      const LS_KEY = 'ignite_pending_sessions_jsplugin';
      function savePending(p) {
        try {
          const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          list.push(p);
          localStorage.setItem(LS_KEY, JSON.stringify(list));
        } catch (e) { /* ignore */ }
      }

      function trySend(p) {
        let sent = false;
        // site-local bridge
        try {
          if (window.myJsAnalytics && typeof window.myJsAnalytics.trackGameSession === 'function') {
            window.myJsAnalytics.trackGameSession(p);
            sent = true;
          }
        } catch (e) { /* continue */ }

        // React Native WebView
        try {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify(p));
            sent = true;
          }
        } catch (e) { /* continue */ }

        // parent/frame
        try {
          const target = window.__GodotAnalyticsParentOrigin || '*';
          window.parent.postMessage(p, target);
          sent = true;
        } catch (e) { /* continue */ }

        // debug fallback - console
        if (!sent) {
          try { console.log('Payload:' + JSON.stringify(p)); } catch (e) { /* swallow */ }
        }

        return sent;
      }

      function flushPending() {
        try {
          const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          if (!list || !list.length) return;
          list.forEach(function (p) { trySend(p); });
          localStorage.removeItem(LS_KEY);
        } catch (e) { /* ignore */ }
      }

      // attempt send
      const ok = trySend(payload);
      if (!ok) savePending(payload);

      // ensure pending flush is registered once
      try {
        if (typeof window !== 'undefined') {
          window.addEventListener && window.addEventListener('online', flushPending);
          window.addEventListener && window.addEventListener('load', flushPending);
          // listen for handshake message to set parent origin
          window.addEventListener && window.addEventListener('message', function (ev) {
            try {
              const msg = (typeof ev.data === 'string') ? JSON.parse(ev.data) : ev.data;
              if (msg && msg.type === 'ANALYTICS_CONFIG' && msg.parentOrigin) {
                window.__GodotAnalyticsParentOrigin = msg.parentOrigin;
              }
            } catch (e) { /* ignore */ }
          });
          // try flushing shortly after submit to catch same-page parent
          setTimeout(flushPending, 2000);
        }
      } catch (e) { /* ignore */ }
    }
    
    /**
     * Send an arbitrary payload via the same bridge mechanisms as submitReport.
     * Used by GameManager auto-save to deliver progress payloads.
     * @param {Object} payload - Payload to send
     */
    sendEvent(payload) {
      if (typeof window === 'undefined') return;

      const LS_KEY = 'ignite_pending_sessions_jsplugin';

      function savePending(p) {
        try {
          const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          list.push(p);
          localStorage.setItem(LS_KEY, JSON.stringify(list));
        } catch (e) { /* ignore */ }
      }

      let sent = false;

      try {
        if (window.myJsAnalytics && typeof window.myJsAnalytics.trackGameSession === 'function') {
          window.myJsAnalytics.trackGameSession(payload);
          sent = true;
        }
      } catch (e) { /* continue */ }

      try {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          sent = true;
        }
      } catch (e) { /* continue */ }

      try {
        const target = window.__GodotAnalyticsParentOrigin || '*';
        window.parent.postMessage(payload, target);
        sent = true;
      } catch (e) { /* continue */ }

      if (!sent) {
        savePending(payload);
        console.log('[Analytics] Auto-save payload queued (no bridge):', JSON.stringify(payload, null, 2));
      } else {
        console.log('[Analytics] Auto-save payload sent:', JSON.stringify(payload, null, 2));
      }
    }

    /**
     * Get current report data (for debugging)
     * @returns {Object} Current analytics data
     */
    getReportData() {
      return JSON.parse(JSON.stringify(this._reportData)); // Deep clone
    }
    
    /**
     * Reset analytics data (useful for new sessions)
     */
    reset() {
      this._reportData.xpEarnedTotal = 0;
      this._reportData.highestLevelPlayed = 0;
      this._reportData.rawData = [];
      this._reportData.diagnostics.levels = [];
      console.log('[Analytics] Data reset');
    }
    
    // --- Internal Helpers ---
    
    /**
     * Update highest level reached based on numeric value in level ID
     * @private
     * @param {string|number} levelId
     */
    _updateHighestLevel(levelId) {
      const idString = String(levelId);
      
      // Try direct numeric conversion first
      let num = parseFloat(idString);
      
      // If not directly numeric, try to extract number from pattern like 'campaign_level_3' or 'level_2'
      if (isNaN(num) || !isFinite(num)) {
        const match = idString.match(/(\d+)/);
        if (match) {
          num = parseFloat(match[1]);
        }
      }
      
      // Update if we found a valid number
      if (!isNaN(num) && isFinite(num)) {
        const current = this._reportData.highestLevelPlayed;
        if (num > current) {
          this._reportData.highestLevelPlayed = num;
        }
      }
    }
    
    /**
     * Find level by ID (searches backwards for most recent)
     * @private
     * @param {string} levelId
     * @returns {Object|null}
     */
    _getLevelById(levelId) {
      const levels = this._reportData.diagnostics.levels;
      for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i].levelId === levelId) {
          return levels[i];
        }
      }
      return null;
    }
  }

  return AnalyticsManager;

}));
