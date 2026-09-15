(() => {
  const actions = [function(event) { toggleAutoRepair() },
function(event) { togglePanel('health-panel-content', 'health-panel-icon') },
function(event) { togglePanel('metrics-panel-content', 'metrics-panel-icon') },
function(event) { togglePanel('finances-panel-content', 'finances-panel-icon') },
function(event) { i18n.setLocale(this.value) },
function(event) { showSaveModal() },
function(event) { restartGame() },
function(event) { handleGameState(0) },
function(event) { handleGameState(1) },
function(event) { handleGameState(3) },
function(event) { clearAllServices() },
function(event) { setSandboxBudget(this.value) },
function(event) { setSandboxBudget(this.value) },
function(event) { resetBudget() },
function(event) { toggleUpkeep() },
function(event) { setSandboxRPS(this.value) },
function(event) { setSandboxRPS(this.value) },
function(event) { setTrafficMix('STATIC',this.value) },
function(event) { setTrafficMix('STATIC',this.value) },
function(event) { setTrafficMix('READ',this.value) },
function(event) { setTrafficMix('READ',this.value) },
function(event) { setTrafficMix('WRITE',this.value) },
function(event) { setTrafficMix('WRITE',this.value) },
function(event) { setTrafficMix('UPLOAD',this.value) },
function(event) { setTrafficMix('UPLOAD',this.value) },
function(event) { setTrafficMix('SEARCH',this.value) },
function(event) { setTrafficMix('SEARCH',this.value) },
function(event) { setTrafficMix('INFERENCE',this.value) },
function(event) { setTrafficMix('INFERENCE',this.value) },
function(event) { setTrafficMix('MALICIOUS',this.value) },
function(event) { setTrafficMix('MALICIOUS',this.value) },
function(event) { setBurstCount(this.value) },
function(event) { spawnBurst('STATIC') },
function(event) { spawnBurst('READ') },
function(event) { spawnBurst('WRITE') },
function(event) { spawnBurst('UPLOAD') },
function(event) { spawnBurst('SEARCH') },
function(event) { spawnBurst('MALICIOUS') },
function(event) { setTool('select') },
function(event) { setTool('connect') },
function(event) { setTool('delete') },
function(event) { setTool('unlink') },
function(event) { showFAQ() },
function(event) { toggleFailureBadges() },
function(event) { toggleFailureModal() },
function(event) { retryWithSameArchitecture() },
function(event) { restartGame() },
function(event) { toggleFailureModal() },
function(event) { resumeGame() },
function(event) { startGame() },
function(event) { openCampaignSelect() },
function(event) { startTutorial() },
function(event) { startSandbox() },
function(event) { showTrophies() },
function(event) { onClickContinueGame() },
function(event) { showFAQ() },
function(event) { saveGameState('browser') },
function(event) { closeSaveModal() },
function(event) { closeShareModal() },
function(event) { window.tutorial?.skip() },
function(event) { closeFAQ() },
function(event) { closeFAQ() },
function(event) { closeTrophies() },
function(event) { exitCampaignToMenu() },
function(event) { exitCampaignToMap() },
function(event) { campaignStartCurrentLevel() },
function(event) { campaignRetryLevel() },
function(event) { campaignNextLevel() },
function(event) { exitCampaignToMap() }];
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-lab-click]') : null;
    if (!target) return;
    const action = actions[Number(target.getAttribute('data-lab-click'))];
    if (action) action.call(target, event);
  });
document.addEventListener('change', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-lab-change]') : null;
    if (!target) return;
    const action = actions[Number(target.getAttribute('data-lab-change'))];
    if (action) action.call(target, event);
  });
document.addEventListener('input', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-lab-input]') : null;
    if (!target) return;
    const action = actions[Number(target.getAttribute('data-lab-input'))];
    if (action) action.call(target, event);
  });
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-lab-tool]') : null;
    if (button) window.setTool(button.getAttribute('data-lab-tool'));
  });
})();