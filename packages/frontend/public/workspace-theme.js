/* Small same-origin, CSP-compatible bootstrap. Runs before styles to avoid a light flash. */
(function () {
  if (document.currentScript.getAttribute('data-site-mode') !== 'community') return;
  var preference = 'system';
  try { var saved = localStorage.getItem('webfish:appearance:v1'); if (saved === 'light' || saved === 'dark') preference = saved; } catch (_) {}
  var dark = preference === 'dark' || (preference === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.dataset.siteMode = 'community';
  root.dataset.colorMode = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.backgroundColor = dark ? '#0d1117' : '#ffffff';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d1117' : '#f6f8fa');
}());
