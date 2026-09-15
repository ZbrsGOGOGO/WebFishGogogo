// Site adaptation: HTML/keyboard-accessible equivalents of the original menu.
$.setupAccessibleControls = function () {
  if ($.accessibleControlsReady) return;
  const start = document.getElementById("lab-start");
  const menu = document.getElementById("lab-menu");
  const canvas = document.getElementById("cmg");
  if (!start || !menu || !canvas) return;
  $.accessibleControlsReady = true;
  $.syncAccessibleControls = function () {
    start.disabled = $.state !== "menu";
    menu.disabled = !$.state || $.state === "menu";
  };
  start.addEventListener("click", function () {
    // Never reset a live/paused/completed wave through a stale or synthetic click.
    if ($.state !== "menu") return;
    $.reset();
    $.audio.play("levelup");
    $.setState("play");
    canvas.focus({ preventScroll: true });
  });
  menu.addEventListener("click", function () {
    if (!$.state || $.state === "menu") return;
    // This explicit button ends the current wave, without a sandbox-blocked modal.
    $.setState("menu");
    start.focus({ preventScroll: true });
  });
  $.syncAccessibleControls();
};
window.addEventListener("load", $.setupAccessibleControls);
