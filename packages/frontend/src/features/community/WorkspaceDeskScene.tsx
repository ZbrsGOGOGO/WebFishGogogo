import { useEffect, useRef, useState, type JSX } from 'react';
import * as THREE from 'three';
import styles from './WorkspaceDeskScene.module.css';

/** Decorative, opt-in scene: no network assets, account data or persisted state. */
export default function WorkspaceDeskScene(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef(true);
  const wakeRef = useRef<() => void>(() => {});
  const [lampOn, setLampOn] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  lampRef.current = lampOn;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = (): void => setReduced(media?.matches ?? false);
    media?.addEventListener('change', change);
    return () => media?.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || reduced || failed) return;
    setReady(false);
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0, stopped = false, onScreen = true, lastFrame = -Infinity, dirty = true;
    let target = 0, rotation = 0;
    const scene = new THREE.Scene();
    const model = new THREE.Group();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const material = (color: number, roughness = .7): THREE.MeshStandardMaterial => {
      const value = new THREE.MeshStandardMaterial({ color, roughness, metalness: .08 });
      materials.add(value); return value;
    };
    const blue = material(0xbdd2ea), graphite = material(0x29384c), light = material(0xe4edf4), green = material(0x679b85), paper = material(0xe8d8b8), dark = material(0x17283e);
    const mesh = (geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      geometries.add(geometry); const object = new THREE.Mesh(geometry, surface); object.position.set(x, y, z); model.add(object); return object;
    };
    const box = (w: number, h: number, d: number, surface: THREE.Material, x: number, y: number, z: number): THREE.Mesh => mesh(new THREE.BoxGeometry(w, h, d), surface, x, y, z);
    box(2.8, .14, 1.75, blue, 0, 0, 0);
    for (const x of [-1.12, 1.12]) for (const z of [-.6, .6]) box(.09, .8, .09, graphite, x, -.47, z);
    box(.7, .06, .34, graphite, -.15, .11, -.36);
    box(.1, .45, .1, graphite, -.15, .32, -.42);
    box(1.36, .82, .12, graphite, -.15, .77, -.45);
    box(1.2, .65, .015, dark, -.15, .77, -.382);
    const screenGlow = new THREE.MeshStandardMaterial({ color: 0x8ec8ee, emissive: 0x3879a1, emissiveIntensity: .45, roughness: .8 });
    materials.add(screenGlow);
    for (let index = 0; index < 3; index += 1) box(.65 - index * .13, .026, .018, screenGlow, -.33, .95 - index * .12, -.366);
    box(.88, .055, .35, light, -.15, .12, .37);
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 7; col += 1) box(.076, .012, .06, blue, -.46 + col * .104, .155, .27 + row * .08);
    mesh(new THREE.CylinderGeometry(.12, .1, .26, 12), light, -.98, .22, .23);
    mesh(new THREE.CylinderGeometry(.105, .105, .012, 12), dark, -.98, .356, .23);
    const mugHandle = mesh(new THREE.TorusGeometry(.074, .023, 6, 12), light, -1.105, .23, .23); mugHandle.rotation.y = Math.PI / 2;
    box(.4, .04, .5, paper, .88, .13, .47).rotation.y = -.16;
    box(.012, .006, .45, graphite, .92, .154, .46).rotation.y = -.16;
    mesh(new THREE.CylinderGeometry(.15, .12, .27, 10), light, 1.0, .21, -.5);
    for (let index = 0; index < 5; index += 1) {
      const angle = index * Math.PI * 2 / 5;
      const leaf = mesh(new THREE.SphereGeometry(.14, 8, 6), green, 1.0 + Math.cos(angle) * .12, .47 + (index % 2) * .1, -.5 + Math.sin(angle) * .12);
      leaf.scale.set(.45, 1.5, .7); leaf.rotation.z = Math.cos(angle) * .55;
    }
    mesh(new THREE.CylinderGeometry(.13, .13, .035, 12), graphite, -.98, .1, -.58);
    box(.035, .66, .035, graphite, -.98, .43, -.58);
    const shade = mesh(new THREE.ConeGeometry(.19, .2, 12, 1, true), blue, -.98, .78, -.58); shade.rotation.z = .18;
    const lamp = new THREE.PointLight(0xbcdfff, 3.5, 3, 2); lamp.position.set(-.96, .68, -.55); model.add(lamp);
    const applyLighting = (): void => {
      lamp.intensity = lampRef.current ? 3.5 : 0;
      screenGlow.emissiveIntensity = lampRef.current ? .45 : .05;
    };
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xe2f1ff, 0x788296, 2.8));
    const sunlight = new THREE.DirectionalLight(0xffffff, 3.0); sunlight.position.set(2, 4, 3); scene.add(sunlight);
    const camera = new THREE.OrthographicCamera(-2.3, 2.3, 1.8, -1.8, .1, 30);
    camera.position.set(4, 3.4, 5); camera.lookAt(0, .16, 0);
    let resizeObserver: ResizeObserver | undefined, intersectionObserver: IntersectionObserver | undefined;
    const resize = (): void => {
      const width = host.clientWidth, height = host.clientHeight;
      if (!renderer || width <= 0 || height <= 0) return;
      const aspect = width / height;
      camera.left = -1.82 * aspect; camera.right = 1.82 * aspect; camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      dirty = true; schedule();
    };
    const schedule = (): void => { if (!stopped && onScreen && !document.hidden && frame === 0) frame = window.requestAnimationFrame(draw); };
    const draw = (time: number): void => {
      frame = 0;
      if (stopped || !onScreen || document.hidden || !renderer) return;
      if (time - lastFrame >= 1000 / 30 && (dirty || Math.abs(target - rotation) > .0008)) {
        lastFrame = time; rotation += (target - rotation) * .085; model.rotation.y = rotation;
        applyLighting();
        renderer.render(scene, camera);
        dirty = false;
      }
      // Once settled, leave neither rendering nor an idle requestAnimationFrame running.
      if (dirty || Math.abs(target - rotation) > .0008) schedule();
    };
    const wake = (): void => { dirty = true; schedule(); };
    wakeRef.current = wake;
    const visibility = (): void => { if (document.hidden || !onScreen) { window.cancelAnimationFrame(frame); frame = 0; } else wake(); };
    const pointer = (event: PointerEvent): void => { const rect = host.getBoundingClientRect(); if (rect.width > 0) { target = ((event.clientX - rect.left) / rect.width - .5) * .65; wake(); } };
    const leave = (): void => { target = 0; wake(); };
    const lost = (event: Event): void => { event.preventDefault(); setFailed(true); };
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.append(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', lost);
      if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(entries => {
          const entry = entries[0], ratio = entry?.intersectionRatio;
          // Legacy observers may omit ratio; their intersecting flag remains usable.
          onScreen = Boolean(entry?.isIntersecting) && (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio >= .05);
          visibility();
        }, { threshold: .05 });
        intersectionObserver.observe(host);
      }
      host.addEventListener('pointermove', pointer); host.addEventListener('pointerleave', leave);
      window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
      resize(); applyLighting(); renderer.render(scene, camera); setReady(true);
      dirty = false; window.cancelAnimationFrame(frame); frame = 0;
    } catch { setFailed(true); }
    return () => {
      stopped = true; window.cancelAnimationFrame(frame); resizeObserver?.disconnect(); intersectionObserver?.disconnect();
      wakeRef.current = () => {};
      host.removeEventListener('pointermove', pointer); host.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
      renderer?.domElement.removeEventListener('webglcontextlost', lost);
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose());
    };
  }, [reduced, failed]);
  const unavailable = reduced || failed;
  return <div className={styles.scene}>
    <div ref={hostRef} className={styles.canvasHost} />
    {unavailable || !ready ? <div className={styles.fallback} role="status"><strong>{reduced ? '已开启减少动效' : failed ? '当前设备暂不支持 3D 视角' : '正在打开个人空间…'}</strong><p>{unavailable ? '已切换为轻量界面，工具和游戏仍可正常使用。' : '场景只在本地绘制，不读取账户资料。'}</p></div> : null}
    {!unavailable && ready ? <div className={styles.controls}><span>移动指针转动视角</span><button type="button" aria-pressed={lampOn} onClick={() => { const next = !lampRef.current; lampRef.current = next; setLampOn(next); wakeRef.current(); }}>{lampOn ? '熄灭台灯' : '点亮台灯'} <span aria-hidden="true">{lampOn ? '◉' : '○'}</span></button></div> : null}
  </div>;
}
