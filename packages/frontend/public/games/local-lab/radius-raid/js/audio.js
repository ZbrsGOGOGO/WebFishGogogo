// Site adaptation: no audio files or audio engine are shipped.
// Preserve the original game's chainable play(...).rate(...) call contract.
$.audio = {
  play: function () {
    return { rate: function () { return this; } };
  }
};
