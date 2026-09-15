// Site adaptation: CSP-safe equivalent of the original inline event handlers.
(function () {
  const allowed = new Set(["head", "misn", "menu", "deal", "clos"]);
  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest("[data-game-event]");
    if (!action) return;
    const name = action.getAttribute("data-game-event");
    if (!allowed.has(name)) return;
    const encoded = action.getAttribute("data-game-detail");
    let detail;
    if (encoded !== null) {
      try { detail = JSON.parse(encoded); } catch (_) { return; }
    }
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  });
})();
