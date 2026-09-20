(function () {
  const raw = new URLSearchParams(location.search).get('player') || 'anonymous';
  window.ZYJ_PLAYER_KEY = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'anonymous';

  const syncTheme = () => {
    let mode = 'light';
    try { mode = window.parent.document.documentElement.dataset.colorMode || 'light'; } catch (_) {}
    document.documentElement.dataset.colorMode = mode === 'dark' ? 'dark' : 'light';
  };
  syncTheme();
  try {
    new MutationObserver(syncTheme).observe(window.parent.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode'],
    });
  } catch (_) {}
})();
