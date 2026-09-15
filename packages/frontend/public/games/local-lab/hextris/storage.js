/* Hextris self-hosted adaptation, 2026-09-15; GPL-3.0-or-later.
 * Opaque iframe storage and cookies are intentionally unavailable. No substitute
 * database or fake persisted save is used; running game state remains in memory.
 */
window.hextrisRead = function (key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
};
window.hextrisWrite = function (key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* no persistence */ }
};
