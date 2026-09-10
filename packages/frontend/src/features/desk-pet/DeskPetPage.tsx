import { useEffect, useRef, useState } from 'react';
import { useDeskPet } from './DeskPetContext';
import { PetAppearance } from './PetAppearance';
import { PET_STYLES, preparePetImage, type PetPreset } from './pet-model';
import styles from './DeskPet.module.css';

export function DeskPetPage() {
  const { prefs, update, clear, storageError, owner } = useDeskPet();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmClear, setConfirmClear] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const pick = async (file?: File): Promise<void> => {
    if (!file) return;
    const token = ++generation.current; setBusy(true); setError('');
    try {
      const result = await preparePetImage(file);
      if (token === generation.current) update(result);
    } catch (err) { if (token === generation.current) setError(err instanceof Error ? err.message : '图片处理失败，请重试。'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  return <section className={styles.page} aria-labelledby="desk-pet-heading">
    <header className={styles.pageHeader}><span className={styles.eyebrow}>DESK BUDDY / 工位小陪伴</span><h1 id="desk-pet-heading">领一个工位搭子</h1><p>带上喜欢的照片，给平平无奇的工位添一点小表情。</p><span className={styles.badge}>完全免费 · 无声陪伴 · 图片不上传</span></header>
    <div className={styles.editor}>
      <section className={styles.previewCard} aria-label="搭子实时预览">
        <div className={styles.previewDesk}><span className={styles.deskNote}>今日待办<br/>☑ 好好工作<br/>☑ 适当摸鱼</span><PetAppearance prefs={prefs} preview /><span className={styles.deskLine} /></div>
        <h2>{prefs.name.trim() || '摸摸'}</h2><p>{PET_STYLES.find(s => s.id === prefs.style)?.description}</p>
        <button type="button" className={styles.primary} disabled={owner === 'unavailable'} onClick={() => update({ enabled: true, collapsed: false })}>{prefs.enabled ? '召回桌宠' : '领养到我的工位'}</button>
        <p className={styles.small}>{prefs.enabled ? prefs.collapsed ? '已收起，点召回即可重新出现。' : '已领养，可在页面角落拖动、摸头和喂食。' : '默认不显示，领养后才会出现在页面角落。'}</p>
        {owner === 'unavailable' ? <p role="status">账号状态确认后即可使用；游客也可免费体验。</p> : null}
      </section>
      <section className={styles.settings} aria-label="搭子装扮设置">
        <h2>01 / 选个模样</h2>
        <div className={styles.presets}>{([['fish','摸摸鱼'],['cat','打工喵'],['sprout','发芽了']] as [PetPreset, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={!prefs.image && prefs.preset === id} disabled={busy} onClick={() => update({ preset: id, image: null, pixelImage: null })}><PetAppearance prefs={{ ...prefs, preset: id, image: null, pixelImage: null, size: 56, style: 'sticker' }} preview /><span>{label}</span></button>)}</div>
        <label className={styles.upload}>用自己的图片<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void pick(file); }} /></label>
        <p className={styles.small}>PNG / JPG / 静态 WebP，最多 4 MB、1600 万像素，单边不超过 4096。透明 PNG 更像贴纸；不会自动抠图或 AI 重绘。像素风对自定义图片进行 32 × 32 缩绘，内置搭子保留矢量轮廓。</p>
        {busy ? <p role="status">正在本机处理图片…</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <h2>02 / 换个风格</h2>
        <div className={styles.styleGrid}>{PET_STYLES.map(style => <button key={style.id} type="button" aria-pressed={prefs.style === style.id} onClick={() => update({ style: style.id })}><PetAppearance prefs={{ ...prefs, style: style.id, size: 54 }} preview /><strong>{style.label}</strong><small>{style.description}</small></button>)}</div>
        <h2>03 / 一起上班</h2>
        <label className={styles.field}>搭子名字<input maxLength={16} value={prefs.name} onChange={event => update({ name: event.target.value })} placeholder="给它起个名字" /></label>
        <label className={styles.field}>大小 · {prefs.size}px<input type="range" min="64" max="144" step="8" value={prefs.size} onChange={event => update({ size: Number(event.target.value) })} /></label>
        <label className={styles.check}><input type="checkbox" checked={prefs.quiet} onChange={event => update({ quiet: event.target.checked })} />安静模式：关闭装饰动画与升级祝贺，点击仍会回应</label>
        <label className={styles.check}><input type="checkbox" checked={prefs.focusMode} onChange={event => update({ focusMode: event.target.checked })} />专注避让：在聊天、私聊、游戏及纸上突围小窗打开时隐藏</label>
        <div className={styles.controls}><button type="button" onClick={() => update({ position: null })}>位置归位</button><button type="button" disabled={!prefs.enabled} onClick={() => update({ collapsed: true })}>暂时收起</button><button type="button" disabled={!prefs.enabled} onClick={() => update({ enabled: false })}>关闭桌宠</button></div>
        {storageError ? <p role="alert" className={styles.error}>{storageError}</p> : null}
        <p className={styles.small}>设置会自动保存在当前浏览器。{owner === 'guest' ? '当前是游客档案，登录后使用独立账号档案。' : '账号之间使用独立本机档案。'}不跨设备同步；清除浏览器网站数据会丢失，公共电脑上的本地数据并非加密保险箱。</p>
        <details><summary>互动、隐私与清除</summary><p>点击摸头，按钮喂食、睡觉；拖动或聚焦搭子后用方向键移动，Esc 收起。无音效、无后台挂机、无额外奖励，不消耗办公币。已有摸鱼指数升级时可收到祝贺，不替你佩戴称号。</p><p>仅保存缩小重绘后的 PNG 与设置，不保存原图、文件名或拍摄信息，不发送到服务器或第三方。处理照片时不要使用敏感材料。离开网站后桌宠不会显示；本机数据需要在每台设备分别清除。</p>
          {confirmClear ? <div className={styles.controls}><span>删除此档案的图片和全部桌宠设置？无法撤销。</span><button type="button" disabled={busy} onClick={() => { generation.current++; clear(); setConfirmClear(false); }}>确认清除桌宠数据</button><button type="button" onClick={() => setConfirmClear(false)}>取消</button></div> : <button type="button" disabled={busy} onClick={() => setConfirmClear(true)}>清除本机桌宠数据</button>}
        </details>
      </section>
    </div>
  </section>;
}
