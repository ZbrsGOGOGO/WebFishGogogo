/* 九层妖塔 · 启动 */
(function () {
  'use strict';
  const ALLOWED_TABS = ['grow', 'explore', 'equip', 'raise', 'forge', 'shop', 'coop', 'friend', 'sect', 'gongfa', 'bag', 'rank'];
  function start() {
    window.UI.init();
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && ALLOWED_TABS.indexOf(requested) >= 0) window.setTimeout(function () { window.UI.switchTab(requested); }, 0);
  }
  function afterDocument() {
    // 静态源码只在摸摸公司父页面完成认证桥握手后启动。直接打开此文件不会
    // 绕过账号门禁创建或覆盖联网档案。
    if (window.API && window.API.whenReady) window.API.whenReady.then(start);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterDocument);
  else afterDocument();
})();
