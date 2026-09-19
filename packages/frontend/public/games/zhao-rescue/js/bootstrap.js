(function () {
  const raw = new URLSearchParams(location.search).get('player') || 'anonymous';
  window.ZYJ_PLAYER_KEY = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'anonymous';
})();
