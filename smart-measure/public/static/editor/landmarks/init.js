// Initialize Interactive Landmark Editor
let editor = null;

(async function() {
  try {
    // Read SKU from data attribute
    const appContainer = document.getElementById('landmarks-app');
    if (!appContainer) {
      throw new Error('App container not found');
    }
    
    const sku = appContainer.dataset.sku;
    window.logger.debug('🚀 Loading measurement data for SKU:', sku);

    // ── 認証トークン付き fetch ─────────────────────────────────────
    // auth-guard.js は type="module" で非同期初期化されるため、
    // window.authenticatedFetch が存在するまで最大 5 秒ポーリングで待つ。
    async function authFetch(url, options = {}) {
      if (typeof window.authenticatedFetch === 'function') {
        return window.authenticatedFetch(url, options);
      }
      const MAX_WAIT_MS = 5000;
      const INTERVAL_MS = 100;
      let waited = 0;
      while (waited < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        waited += INTERVAL_MS;
        if (typeof window.authenticatedFetch === 'function') {
          return window.authenticatedFetch(url, options);
        }
      }
      // フォールバック: localStorage のトークンを直接使う
      const token = localStorage.getItem('firebase_token');
      if (!token) {
        throw new Error('認証トークンがありません。再ログインしてください。');
      }
      const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
      return fetch(url, { ...options, headers });
    }

    // グローバルに公開しておく（interactive-editor.js からも使えるように）
    window._authFetch = authFetch;
    // ──────────────────────────────────────────────────────────────

    const response = await authFetch('/api/measurements/' + sku);

    if (response.status === 401) {
      throw new Error('認証エラー (401)。再ログインしてください。');
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load measurement data');
    }
    
    // result.data（現API）と result.measurement（旧API）の両方に対応
    const measurementData = result.data || result.measurement;
    window.logger.debug('✅ Loaded measurement data:', measurementData);

    // InteractiveLandmarkEditor は (canvasId, data) を受け取る
    // canvasId = 'landmark-canvas'（landmarks.tsx で定義済み）
    editor = new InteractiveLandmarkEditor('landmark-canvas', {
      sku: sku,
      image_url: measurementData.image_url,
      landmarks: measurementData.landmarks || {},
      pixel_per_cm: measurementData.pixel_per_cm || 15.0,
      measurements: measurementData.measurements || {}
    });

    window.logger.debug('✅ Interactive Landmark Editor initialized');

  } catch (error) {
    window.logger.error('❌ Error initializing editor:', error);
    // アラートの代わりにページ内にエラーメッセージを表示
    const canvas = document.getElementById('landmark-canvas');
    if (canvas) {
      const parent = canvas.parentElement;
      const errDiv = document.createElement('div');
      errDiv.className = 'p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm';
      errDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>データの読み込みに失敗しました: ${error.message}`;
      parent.replaceChild(errDiv, canvas);
    }
  }
})();
