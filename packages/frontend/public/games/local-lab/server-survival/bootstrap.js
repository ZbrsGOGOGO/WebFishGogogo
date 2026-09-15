// Site-owned adapter. Deliberately no access to the sandboxed window's
// localStorage getter (which throws for its opaque origin).
(() => {
  const values = new Map();
  const allowed = new Set([
    'game_locale', 'serverSurvivalSave', 'serverSurvivalCampaignProgress',
    'serverSurvivalAchievements', 'serverSurvivalSoundPrefs',
    'serverSurvivalTutorialComplete', 'serverSurvivalFailureBadges',
    'serverSurvivalToolbarCategory',
  ]);
  const sessionStorage = Object.freeze({
    getItem(key) { return allowed.has(String(key)) ? values.get(String(key)) ?? null : null; },
    setItem(key, value) {
      key = String(key); value = String(value);
      if (!allowed.has(key)) throw new Error('Unsupported game session key');
      if (value.length > 2 * 1024 * 1024) throw new Error('Game session save is too large');
      values.set(key, value);
    },
    removeItem(key) { if (allowed.has(String(key))) values.delete(String(key)); },
  });
  Object.defineProperty(window, 'labSessionStorage', { value: sessionStorage, writable: false, configurable: false });

  document.addEventListener('DOMContentLoaded', () => {
    // The original HUD has one stats panel plus four separate right-hand
    // panels. Keep their actual nodes/IDs/content, but group them in a single
    // bounded drawer instead of leaving half the small scene covered.
    const panelIds = ['statsPanel', 'detailsPanel', 'healthPanel', 'metricsPanel', 'financesPanel'];
    const panels = panelIds.map(id => document.getElementById(id)).filter(Boolean);
    const drawer = document.createElement('aside');
    drawer.id = 'lab-metrics-panel';
    drawer.setAttribute('aria-label', '运行指标');
    panels.forEach(panel => drawer.appendChild(panel));
    document.body.appendChild(drawer);
    const metrics = document.createElement('button');
    metrics.id = 'lab-metrics-toggle'; metrics.type = 'button';
    metrics.textContent = '运行指标';
    metrics.setAttribute('aria-controls', [drawer.id, ...panels.map(panel => panel.id)].join(' '));
    const setCollapsed = (collapsed) => {
      if (collapsed && panels.some(panel => panel.contains(document.activeElement))) metrics.focus({ preventScroll: true });
      document.body.classList.toggle('lab-metrics-collapsed', collapsed);
      metrics.setAttribute('aria-expanded', String(!collapsed));
      drawer.hidden = collapsed;
      [drawer, ...panels].forEach(panel => {
        panel.setAttribute('aria-hidden', String(collapsed));
        panel.toggleAttribute('inert', collapsed);
      });
    };
    setCollapsed(window.innerWidth <= 720);
    metrics.addEventListener('click', () => setCollapsed(!document.body.classList.contains('lab-metrics-collapsed')));
    document.body.appendChild(metrics);
    const notice = document.createElement('p');
    notice.id = 'lab-session-notice';
    notice.textContent = '服务器运营模拟 · 默认静音 · 存档与成就仅在本小窗会话保留';
    document.getElementById('main-menu-modal')?.firstElementChild?.appendChild(notice);
    for (const selector of ['[data-lab-session-save]', '[data-lab-session-load]']) {
      const element = document.querySelector(selector);
      if (element) element.textContent = selector.includes('save') ? '保存本轮进度' : '读取本轮进度';
    }
    document.getElementById('btn-save')?.setAttribute('title', '保存本小窗会话，关闭后清除');
  });
})();
