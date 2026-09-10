import { useEffect, useRef, useState } from 'react';
import { preparePetImage } from './pet-model';
import styles from './DeskPet.module.css';

/** Work only on the already validated/re-encoded local image, never remote resources. */
export function PetImageEditor({ image, onApply, onCancel }: { image: string; onApply: (images: { image: string; pixelImage: string }) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), source = useRef<HTMLImageElement | null>(null);
  const previous = useRef<ImageData | null>(null), drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef(true);
  const [zoom, setZoom] = useState(1), [x, setX] = useState(0), [y, setY] = useState(0), [brush, setBrush] = useState(24);
  const [erase, setErase] = useState(false), [undo, setUndo] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    live.current = true;
    const img = new Image();
    img.onload = () => { source.current = img; setReady(true); };
    img.onerror = () => setError('图片无法打开，请重新导入。'); img.src = image;
    return () => { live.current = false; img.onload = null; img.onerror = null; };
  }, [image]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx || !source.current || !ready) return;
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(source.current, (256 - 256 * zoom) / 2 + x, (256 - 256 * zoom) / 2 + y, 256 * zoom, 256 * zoom);
    previous.current = null; setUndo(false);
  }, [ready, zoom, x, y]);
  const apply = async (): Promise<void> => {
    if (!canvas.current || busy) return;
    setBusy(true); setError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(b => b ? resolve(b) : reject(new Error('无法生成图片')), 'image/png'));
      const result = await preparePetImage(new File([blob], 'buddy.png', { type: 'image/png' }));
      if (live.current) onApply(result);
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : '保存失败'); }
    finally { if (live.current) setBusy(false); }
  };
  return <section className={styles.imageEditor} aria-label="本机图片编辑">
    <h3>调整图片</h3><p className={styles.small}>先缩放和移动画面，再用橡皮擦清理背景。重新调整构图会重置擦除；只保存应用后的 256px 图片。</p>
    <canvas ref={canvas} width={256} height={256} aria-label="图片裁剪与擦除画布" className={styles.editCanvas} onPointerDown={event => {
      if (!erase || busy || !ready || event.button !== 0) return;
      const ctx = canvas.current!.getContext('2d')!;
      previous.current = ctx.getImageData(0, 0, 256, 256); setUndo(true);
      const rect = event.currentTarget.getBoundingClientRect();
      const px = (event.clientX - rect.left) * 256 / rect.width, py = (event.clientY - rect.top) * 256 / rect.height;
      drag.current = { id: event.pointerId, x: px, y: py }; event.currentTarget.setPointerCapture(event.pointerId);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(px, py, brush / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }} onPointerMove={event => {
      const d = drag.current; if (!d || d.id !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) * 256 / rect.width, py = (event.clientY - rect.top) * 256 / rect.height;
      const ctx = canvas.current!.getContext('2d')!; ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = brush; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(px, py); ctx.stroke(); ctx.restore(); d.x = px; d.y = py;
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
    <fieldset disabled={!ready || busy} className={styles.editorFields}>
      <label className={styles.field}>缩放 {zoom.toFixed(1)}×<input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label className={styles.field}>左右移动<input type="range" min="-128" max="128" value={x} onChange={e => setX(Number(e.target.value))} /></label>
      <label className={styles.field}>上下移动<input type="range" min="-128" max="128" value={y} onChange={e => setY(Number(e.target.value))} /></label>
      <label className={styles.check}><input type="checkbox" checked={erase} onChange={e => setErase(e.target.checked)} />橡皮擦（鼠标或触屏涂抹）</label>
      <label className={styles.field}>橡皮擦大小<input type="range" min="4" max="80" value={brush} onChange={e => setBrush(Number(e.target.value))} /></label>
      <div className={styles.controls}><button type="button" disabled={!undo} onClick={() => { if (previous.current) canvas.current!.getContext('2d')!.putImageData(previous.current, 0, 0); setUndo(false); }}>撤销上次擦除</button><button type="button" onClick={() => { const ctx = canvas.current!.getContext('2d')!; ctx.clearRect(0,0,256,256); ctx.drawImage(source.current!,0,0,256,256); setZoom(1); setX(0); setY(0); setUndo(false); }}>重置画面</button><button type="button" onClick={() => void apply()}>应用图片</button></div>
    </fieldset>
    <button type="button" onClick={onCancel}>取消编辑</button>{error ? <p role="alert">{error}</p> : null}
  </section>;
}
