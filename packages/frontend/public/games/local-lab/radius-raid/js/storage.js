// Site adaptation: no Storage prototype modification or browser persistence.
// Statistics last only for this iframe instance, including pause/resume.
$.setupStorage = function () {
  $.storage = {
    mute: true, score: 0, level: 0, rounds: 0, kills: 0,
    bullets: 0, powerups: 0, time: 0
  };
};
$.updateStorage = function () {};
$.clearStorage = function () { $.setupStorage(); };
