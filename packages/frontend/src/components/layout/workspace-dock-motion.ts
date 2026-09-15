/**
 * Spring/proximity algorithm adapted from ThreeUI Community, MIT.
 * Copyright (c) 2026 Meng To. Full license: third_party/threeui/LICENSE.
 * Upstream 68802d5428071ada5c20db8094b1649e6bb770ed/topDockController.ts.
 * Uses transforms only, native links, on-demand frames and hidden-tab cleanup.
 */
export function attachWorkspaceDockMotion(root: HTMLElement): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const precise = window.matchMedia('(hover:hover) and (pointer:fine)');
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-item]')).map(element => ({ element, value: 0, velocity: 0, target: 0 }));
  let frame = 0;
  let focusFrame = 0;
  let released = false;
  let previousTime = 0;
  let accumulated = 0;
  const canAnimate = () => !document.hidden && !reduced.matches && precise.matches && root.clientWidth > 0;
  const render = () => items.forEach(item => item.element.style.setProperty('--dock-influence', String(Math.max(0, Math.min(1.08, item.value)))));
  const tick = (time: number) => {
    frame = 0;
    if (released || !canAnimate()) return;
    // Fixed 60Hz steps keep the spring consistent on high-refresh displays.
    accumulated += previousTime ? Math.min(50, Math.max(0, time - previousTime)) : 1000 / 60;
    previousTime = time;
    const steps = Math.min(3, Math.floor((accumulated + .01) / (1000 / 60)));
    accumulated -= steps * (1000 / 60);
    if (steps) {
      for (let step = 0; step < steps; step++) items.forEach(item => {
        item.velocity = (item.velocity + (item.target - item.value) * .19) * .7;
        item.value += item.velocity;
        if (Math.abs(item.target - item.value) < .001 && Math.abs(item.velocity) < .001) { item.value = item.target; item.velocity = 0; }
      });
      render();
    }
    if (items.some(item => Math.abs(item.target - item.value) >= .001 || Math.abs(item.velocity) >= .001)) frame = requestAnimationFrame(tick);
    else { previousTime = 0; accumulated = 0; }
  };
  const wake = () => { if (!frame && !released && canAnimate()) frame = requestAnimationFrame(tick); };
  const reset = () => { items.forEach(item => { item.target = 0; }); wake(); };
  const stop = () => {
    cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); frame = 0; focusFrame = 0; previousTime = 0; accumulated = 0;
    items.forEach(item => { item.target = 0; item.value = 0; item.velocity = 0; item.element.style.removeProperty('--dock-influence'); });
  };
  const pointer = (event: PointerEvent) => {
    if (!canAnimate()) return;
    items.forEach(item => {
      const rect = item.element.getBoundingClientRect();
      const proximity = Math.max(0, 1 - Math.abs(event.clientX - (rect.left + rect.width / 2)) / 122);
      item.target = proximity * proximity * (3 - 2 * proximity);
    });
    wake();
  };
  const focus = (event: FocusEvent) => {
    const element = (event.target as HTMLElement | null)?.closest('[data-dock-item]');
    items.forEach(item => { item.target = item.element === element ? 1 : 0; }); wake();
  };
  const blur = () => {
    cancelAnimationFrame(focusFrame);
    if (!canAnimate()) { reset(); return; }
    focusFrame = requestAnimationFrame(() => { focusFrame = 0; if (!released && !root.contains(document.activeElement)) reset(); });
  };
  const reconfigure = () => { stop(); };
  root.addEventListener('pointermove', pointer);
  root.addEventListener('pointerleave', reset);
  root.addEventListener('focusin', focus);
  root.addEventListener('focusout', blur);
  root.addEventListener('click', reset);
  reduced.addEventListener('change', reconfigure);
  precise.addEventListener('change', reconfigure);
  document.addEventListener('visibilitychange', reconfigure);
  return () => {
    released = true; stop();
    root.removeEventListener('pointermove', pointer); root.removeEventListener('pointerleave', reset);
    root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur); root.removeEventListener('click', reset);
    reduced.removeEventListener('change', reconfigure); precise.removeEventListener('change', reconfigure);
    document.removeEventListener('visibilitychange', reconfigure);
  };
}
