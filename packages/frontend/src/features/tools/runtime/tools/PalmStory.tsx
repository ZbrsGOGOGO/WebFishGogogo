import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';

import { buildPalmStory, type PalmHand, type PalmLineShape, type PalmStoryInput, type BirthTimeSlot } from './palmStoryLogic';
import styles from './PalmStory.module.css';

type PhotoSide = 'left' | 'right';
type PhotoPreview = { dataUrl: string; name: string } | null;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const INITIAL_INPUT: PalmStoryInput = {
  hand: 'left', upperLine: 'unknown', middleLine: 'unknown', sideArc: 'unknown', birthDate: '', birthTime: '',
};

const SHAPE_OPTIONS: Array<{ value: PalmLineShape; label: string }> = [
  { value: 'unknown', label: '暂不记录' },
  { value: 'curved', label: '偏弯曲' },
  { value: 'straight', label: '偏平直' },
  { value: 'branching', label: '有分叉' },
];

function ReferencePalm(): JSX.Element {
  return <svg className={styles.palmDiagram} viewBox="0 0 240 280" fill="none" role="img" aria-label="掌纹位置示意图：上方横线、中部横线、拇指侧弧线">
    <path d="M74 249c-20-23-28-52-32-87l-8-51c-2-13 15-18 21-7l23 40-2-93c0-16 19-18 23-4l12 83-1-101c-1-17 20-19 23-2l8 101 9-88c2-15 22-13 22 3l-2 91 12-59c4-16 24-12 23 5l-9 108c-1 43-16 68-55 77-25 6-49-1-67-16Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M67 143c34-25 82-25 119-12" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round"/>
    <path d="M68 172c32-8 74-9 115 5" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round"/>
    <path d="M76 155c38 39 45 68 43 91" stroke="var(--color-success)" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="186" cy="131" r="11" fill="var(--color-accent)"/><text x="186" y="135" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">1</text>
    <circle cx="181" cy="177" r="11" fill="var(--color-brand)"/><text x="181" y="181" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">2</text>
    <circle cx="117" cy="239" r="11" fill="var(--color-success)"/><text x="117" y="243" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">3</text>
  </svg>;
}

export default function PalmStory(): JSX.Element {
  const [input, setInput] = useState<PalmStoryInput>(INITIAL_INPUT);
  const [leftPhoto, setLeftPhoto] = useState<PhotoPreview>(null);
  const [rightPhoto, setRightPhoto] = useState<PhotoPreview>(null);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [generated, setGenerated] = useState(false);
  const leftInputRef = useRef<HTMLInputElement>(null);
  const rightInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const readersRef = useRef<Record<PhotoSide, FileReader | null>>({ left: null, right: null });
  const mountedRef = useRef(true);
  const report = useMemo(() => buildPalmStory(input), [input]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readersRef.current.left?.abort();
      readersRef.current.right?.abort();
    };
  }, []);
  useEffect(() => {
    if (!generated) return;
    reportRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    reportRef.current?.focus();
  }, [generated]);
  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  function changeInput<K extends keyof PalmStoryInput>(key: K, value: PalmStoryInput[K]): void {
    setInput((current) => ({ ...current, [key]: value }));
    setGenerated(false);
    setFormError('');
  }

  function changePhoto(side: PhotoSide, event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPhotoError('仅支持 JPG、PNG 或 WebP 图片。');
      return;
    }
    if (file.size === 0) {
      setPhotoError('图片是空文件，请换一张再试。');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('图片不能超过 8 MB。');
      return;
    }
    readersRef.current[side]?.abort();
    const reader = new FileReader();
    readersRef.current[side] = reader;
    reader.onload = () => {
      if (!mountedRef.current || readersRef.current[side] !== reader) return;
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        setPhotoError('图片无法读取，请换一张再试。');
        readersRef.current[side] = null;
        return;
      }
      const preview = { dataUrl: reader.result, name: file.name };
      if (side === 'left') setLeftPhoto(preview);
      else setRightPhoto(preview);
      readersRef.current[side] = null;
    };
    reader.onerror = () => {
      if (mountedRef.current && readersRef.current[side] === reader) setPhotoError('图片无法读取，请换一张再试。');
      if (readersRef.current[side] === reader) readersRef.current[side] = null;
    };
    reader.readAsDataURL(file);
    setPhotoError('');
  }

  function removePhoto(side: PhotoSide): void {
    readersRef.current[side]?.abort();
    readersRef.current[side] = null;
    if (side === 'left') { setLeftPhoto(null); if (leftInputRef.current) leftInputRef.current.value = ''; }
    else { setRightPhoto(null); if (rightInputRef.current) rightInputRef.current.value = ''; }
    setPhotoError('');
  }

  function rejectBrokenPhoto(side: PhotoSide): void {
    if (side === 'left') setLeftPhoto(null);
    else setRightPhoto(null);
    setPhotoError('图片无法显示，可能不是有效的 JPG、PNG 或 WebP 文件。');
  }

  function reset(): void {
    readersRef.current.left?.abort();
    readersRef.current.right?.abort();
    readersRef.current.left = null;
    readersRef.current.right = null;
    setInput(INITIAL_INPUT);
    setLeftPhoto(null);
    setRightPhoto(null);
    if (leftInputRef.current) leftInputRef.current.value = '';
    if (rightInputRef.current) rightInputRef.current.value = '';
    setPhotoError('');
    setFormError('');
    setGenerated(false);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!report) {
      setGenerated(false);
      setFormError('请先手动记录至少一条纹路。照片、日期或时段不会自动得到掌纹解读。');
      return;
    }
    setFormError('');
    setGenerated(true);
  }

  const photoFields: Array<{ side: PhotoSide; label: string; photo: PhotoPreview; ref: typeof leftInputRef }> = [
    { side: 'left', label: '左手', photo: leftPhoto, ref: leftInputRef },
    { side: 'right', label: '右手', photo: rightPhoto, ref: rightInputRef },
  ];

  return <div className={styles.root}>
    <div className={styles.intro}>
      <div><span className={styles.kicker}>LOCAL · JUST FOR FUN</span><h3>从自己的观察，写一张小卡片</h3><p>这里没有图片识别或 AI 算命。照片只是你的本地参考；报告只取决于你亲自选择的纹路特点和可选的时间信息。</p></div>
      <span className={styles.privacyBadge}>不上传 · 不保存</span>
    </div>

    <form onSubmit={submit}>
      <section className={styles.section} aria-labelledby="palm-photo-heading">
        <div className={styles.sectionTitle}><span>01</span><div><h4 id="palm-photo-heading">照片参考（可跳过）</h4><p>只在本机预览，照片不参与自动分析。支持 JPG、PNG、WebP，单张不超过 8 MB。</p></div></div>
        <div className={styles.photoGrid}>
          {photoFields.map(({ side, label, photo, ref }) => <div className={styles.photoSlot} key={side}>
            {photo ? <img src={photo.dataUrl} alt={`${label}照片本地预览`} onError={() => rejectBrokenPhoto(side)} /> : <div className={styles.emptyPhoto} aria-hidden="true"><span>＋</span>{label}照片</div>}
            <div className={styles.photoActions}>
              <label className={styles.uploadLabel}>{photo ? `更换${label}照片` : `选择${label}照片`}<input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => changePhoto(side, event)} /></label>
              {photo ? <button type="button" onClick={() => removePhoto(side)}>移除</button> : null}
            </div>
            {photo ? <small title={photo.name}>{photo.name}</small> : null}
          </div>)}
        </div>
        {photoError ? <p className={styles.error} role="alert">{photoError}</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="palm-observe-heading">
        <div className={styles.sectionTitle}><span>02</span><div><h4 id="palm-observe-heading">自己观察与标注</h4><p>对照示意图记录看到的形状；看不清就保持“暂不记录”。传统名称不代表任何科学结论。</p></div></div>
        <div className={styles.observeGrid}>
          <div className={styles.diagramWrap}><ReferencePalm /><ol><li>上方横线</li><li>中部横线</li><li>拇指侧弧线</li></ol></div>
          <div className={styles.fields}>
            <label>观察哪只手<select value={input.hand} onChange={(event) => changeInput('hand', event.target.value as PalmHand)}><option value="left">左手</option><option value="right">右手</option><option value="both">双手综合</option></select></label>
            {([['upperLine', '上方横线'], ['middleLine', '中部横线'], ['sideArc', '拇指侧弧线']] as const).map(([key, label]) => <label key={key}>{label}<select value={input[key]} onChange={(event) => changeInput(key, event.target.value as PalmLineShape)}>{SHAPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="palm-time-heading">
        <div className={styles.sectionTitle}><span>03</span><div><h4 id="palm-time-heading">时间底色（可跳过）</h4><p>只借用生日季节和时段作为卡片配色灵感；不计算四柱、星盘或运势。</p></div></div>
        <div className={styles.timeFields}>
          <label>生日日期<input type="date" value={input.birthDate} onChange={(event) => changeInput('birthDate', event.target.value)} /></label>
          <label>出生时段<select value={input.birthTime} onChange={(event) => changeInput('birthTime', event.target.value as BirthTimeSlot)}><option value="">暂不填写</option><option value="morning">清晨</option><option value="daytime">白天</option><option value="evening">傍晚</option><option value="night">夜间</option></select></label>
        </div>
      </section>

      <div className={styles.formActions}><button type="submit" className={styles.primary}>生成趣味卡片</button><button type="button" onClick={reset}>清空本页内容</button></div>
      {formError ? <p ref={formErrorRef} className={styles.error} role="alert" tabIndex={-1}>{formError}</p> : null}
    </form>

    {generated && report ? <section ref={reportRef} className={styles.report} aria-labelledby="palm-report-heading" aria-live="polite" tabIndex={-1}><span className={styles.kicker}>YOUR OWN NOTES</span><h3 id="palm-report-heading">{report.title}</h3><p className={styles.reportIntro}>下面每一条都附上来源，包含掌纹主题、表达、工作、人际和五步自我探索。它们是趣味练习，不是对你性格、健康或未来的判断。</p><div className={styles.reportGrid}>{report.sections.map((item) => <article key={item.label}><span>{item.label}</span><p className={styles.evidence}>{item.evidence}</p><p>{item.prompt}</p></article>)}</div><div className={styles.stages}><h4>五步自我探索 · 不是未来预言</h4><ol>{report.stages.map((item) => <li key={item.label}><strong>{item.label}</strong><p className={styles.evidence}>{item.evidence}</p><p>{item.prompt}</p></li>)}</ol></div></section> : null}
    <p className={styles.disclaimer}>仅供娱乐与自我表达。掌纹与生日不能可靠预测寿命、健康、财运、关系或人生结果；请勿据此作重要决定。关闭页面后，本工具不会保留你的输入和照片。</p>
  </div>;
}
