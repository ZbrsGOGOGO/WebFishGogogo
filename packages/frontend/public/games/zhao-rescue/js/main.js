/*
 * 赵云救阿斗 —— 启动与主循环
 * 仅做「初始化」与「每帧驱动」：装配各层、拉取存档、驱动 update→draw→HUD。
 */
(function () {
  const core = ZYJ.core, render = ZYJ.render, ui = ZYJ.ui, api = ZYJ.api, config = ZYJ.config;
  let lastT = 0;
  let netSyncTimer = 0;                // PVP 轻量位置校正计时器
  let rafId = 0;
  let autoHidden = false;                // 是否因切到后台而自动暂停

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.1) dt = 0.1;             // 标签页切回时避免大跳
    const G = core.G, board = core.board;
    if (!G || !board) return;
    try {
      core.update(dt);
      // PVP：推进对手重放副本 + 周期性（0.4s）轻量位置校正，平时不额外传整盘
      if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) {
        ZYJ.net.replay.tick(dt);
        netSyncTimer += dt;
        if (netSyncTimer >= 0.4) { netSyncTimer = 0; ZYJ.net.sync(); }
      }
      render.draw();
      ui.renderHUD();
      ui.renderControls();
    } catch (err) {
      ZYJ.ui && ZYJ.ui.log && ZYJ.ui.log('帧异常: ' + (err && err.message));
    }
  }

  // 切到后台自动暂停（避免后台空跑/被浏览器节流），切回自动继续并重置时间基准
  function onVisibility() {
    if (document.hidden) {
      if (!core.paused) { core.paused = true; autoHidden = true; }
    } else {
      if (autoHidden) { core.paused = false; autoHidden = false; }
      lastT = 0;                         // 重置 dt，避免回到前台瞬间大跳或卡住
      if (!rafId) rafId = requestAnimationFrame(loop);   // 兜底重启循环
    }
  }

  async function boot() {
    core.initBoard();                    // 预建棋盘，避免首帧空引用
    try { await api.refresh(); } catch (_) { /* 离线可用 */ }
    try {                                // 拉取并应用数据库数值配置（无库则沿用内置默认）
      await api.loadConfig();
      const cfg = api.getConfig();
      if (cfg) config.applyServerConfig(cfg);
    } catch (_) { /* 离线可用 */ }
    core.loadProgress();                 // 应用（后端/本地）进度
    ui.init();                           // 绑定拖拽 / 菜单 / 控件
    ui.show('home');
    document.addEventListener('visibilitychange', onVisibility);
    rafId = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
