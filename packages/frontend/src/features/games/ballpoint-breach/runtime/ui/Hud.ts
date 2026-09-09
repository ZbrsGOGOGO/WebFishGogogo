// Vendored from Ballpoint Breach (Apache-2.0), commit 96290df3fba1c2b64abac684510155d916117903.
// Modified for WebFish integration (2026-09-09); see third_party/ballpoint-breach/README.md.
export type OverlayMode = 'loading' | 'start' | 'playing' | 'paused' | 'defeat' | 'victory';

export interface HudWeaponState {
  slot: number;
  name: string;
  ammo: number;
  reserve: number;
  description: string;
  selected: boolean;
}

export interface HudSnapshot {
  score: number;
  wave: number;
  enemiesLeft: number;
  health: number;
  maxHealth: number;
  weapons: HudWeaponState[];
  grappleRatio: number;
  blockRatio?: number;
  boss?: { name: string; health: number; maxHealth: number } | null;
  scoped?: boolean;
  reticleSpread?: number;
}

const DAMAGE_STACK_DECAY_PER_SECOND = 1.49;

export function accumulateDamageStrength(
  currentStrength: number,
  damageAmount: number,
  elapsedSeconds = 0,
): number {
  const retained = Math.max(0, currentStrength) * Math.exp(-DAMAGE_STACK_DECAY_PER_SECOND * Math.max(0, elapsedSeconds));
  const hitStrength = Math.max(0.12, Math.min(1, damageAmount / 15));
  return Math.min(1, retained + hitStrength);
}

export class Hud {
  readonly startButton: HTMLButtonElement;
  readonly restartButton: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayCopy: HTMLElement;
  private readonly score: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly health: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly reserve: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly weaponDescription: HTMLElement;
  private readonly grappleBar: HTMLElement;
  private readonly blockWrap: HTMLElement;
  private readonly blockBar: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSubtitle: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly hitMarker: HTMLElement;
  private readonly damageIndicator: HTMLElement;
  private readonly scope: HTMLElement;
  private bannerTimer = 0;
  private tipTimer = 0;
  private hitTimer = 0;
  private damageTimer = 0;
  private damageStack = 0;
  private readonly damageChevrons: Array<{ element: HTMLElement; remaining: number }> = [];

  constructor(private readonly root: HTMLElement) {
    const required = <T extends Element>(selector: string): T => {
      const value = root.querySelector<T>(selector);
      if (!value) throw new Error(`Missing HUD element: ${selector}`);
      return value;
    };
    this.overlay = required('[data-bp="game-overlay"]');
    this.overlayTitle = required('[data-bp="overlay-title"]');
    this.overlayCopy = required('[data-bp="overlay-copy"]');
    this.startButton = required<HTMLButtonElement>('[data-bp="start-button"]');
    this.restartButton = required<HTMLButtonElement>('[data-bp="restart-button"]');
    this.score = required('[data-hud="score"]');
    this.wave = required('[data-hud="wave"]');
    this.enemies = required('[data-hud="enemies"]');
    this.health = required('[data-hud="health"]');
    this.healthBar = required('[data-hud="health-bar"]');
    this.ammo = required('[data-hud="ammo"]');
    this.reserve = required('[data-hud="reserve"]');
    this.weaponName = required('[data-hud="weapon-name"]');
    this.weaponDescription = required('[data-hud="weapon-description"]');
    this.grappleBar = required('[data-hud="grapple-bar"]');
    this.blockWrap = required('[data-bp="block-stamina"]');
    this.blockBar = required('[data-hud="block-bar"]');
    this.bossWrap = required('[data-bp="boss-health"]');
    this.bossName = required('[data-hud="boss-name"]');
    this.bossBar = required('[data-hud="boss-bar"]');
    this.banner = required('[data-bp="wave-banner"]');
    this.bannerTitle = required('[data-bp="wave-banner-title"]');
    this.bannerSubtitle = required('[data-bp="wave-banner-subtitle"]');
    this.tip = required('[data-bp="context-tip"]');
    this.hitMarker = required('[data-bp="hit-marker"]');
    this.damageIndicator = required('[data-bp="damage-indicator"]');
    this.scope = required('[data-bp="scope-overlay"]');
  }

  setMode(mode: OverlayMode): void {
    this.overlay.dataset.mode = mode;
    const visible = mode !== 'playing';
    this.overlay.classList.toggle('visible', visible);
    this.startButton.hidden = mode !== 'start' && mode !== 'loading' && mode !== 'paused';
    this.restartButton.hidden = mode !== 'defeat' && mode !== 'victory';
    if (mode === 'loading') {
      this.overlayTitle.textContent = '纸上突围';
      this.overlayCopy.textContent = '正在整理工作稿…';
      this.startButton.disabled = true;
    } else if (mode === 'start') {
      this.overlayTitle.textContent = '纸上突围';
      this.overlayCopy.textContent = '穿过五轮纸笔关卡。本地单机，静音模式。';
      this.startButton.textContent = '开始练习';
      this.startButton.disabled = false;
    } else if (mode === 'paused') {
      this.overlayTitle.textContent = '工作稿已暂停';
      this.startButton.textContent = '继续练习';
      this.startButton.disabled = false;
      this.overlayCopy.textContent = '点击继续；Esc 释放鼠标并暂停。';
    } else if (mode === 'defeat') {
      this.overlayTitle.textContent = '本轮结束';
      this.overlayCopy.textContent = '整理一下思路，再试一次。';
      this.restartButton.textContent = '重新开始';
    } else if (mode === 'victory') {
      this.overlayTitle.textContent = '五轮已完成';
      this.overlayCopy.textContent = '这页工作稿完成了。';
      this.restartButton.textContent = '再来一轮';
    }
  }

  render(snapshot: HudSnapshot): void {
    this.score.textContent = String(snapshot.score);
    this.wave.textContent = `第 ${snapshot.wave} 轮`;
    this.enemies.textContent = `剩余 ${snapshot.enemiesLeft}`;
    this.health.textContent = String(Math.ceil(snapshot.health));
    this.healthBar.style.setProperty('--value', `${Math.max(0, snapshot.health / snapshot.maxHealth) * 100}%`);
    const current = snapshot.weapons.find((weapon) => weapon.selected) ?? snapshot.weapons[0];
    if (current) {
      this.ammo.textContent = current.name === 'KATANA' ? '∞' : String(current.ammo);
      this.reserve.textContent = current.name === 'KATANA' ? '' : `/${current.reserve}`;
      this.weaponName.textContent = ({ RIFLE: '步枪', SHOTGUN: '霰弹', REVOLVER: '左轮', SNIPER: '狙击', KATANA: '太刀' } as Record<string, string>)[current.name] ?? current.name;
      this.weaponDescription.textContent = current.description;
      this.root.dataset.reticle = current.name.toLowerCase();
    }
    for (const weapon of snapshot.weapons) {
      const row = this.root.querySelector<HTMLElement>(`[data-weapon-slot="${weapon.slot}"]`);
      if (!row) continue;
      row.classList.toggle('selected', weapon.selected);
      const ammo = row.querySelector<HTMLElement>('[data-weapon-ammo]');
      if (ammo) ammo.textContent = weapon.name === 'KATANA' ? '∞' : `${weapon.ammo}/${weapon.reserve}`;
    }
    this.grappleBar.style.setProperty('--value', `${Math.max(0, Math.min(1, snapshot.grappleRatio)) * 100}%`);
    const showBlock = snapshot.blockRatio !== undefined;
    this.blockWrap.classList.toggle('visible', showBlock);
    if (showBlock) this.blockBar.style.setProperty('--value', `${Math.max(0, Math.min(1, snapshot.blockRatio ?? 0)) * 100}%`);
    this.bossWrap.classList.toggle('visible', Boolean(snapshot.boss));
    if (snapshot.boss) {
      this.bossName.textContent = snapshot.boss.name;
      this.bossBar.style.setProperty('--value', `${Math.max(0, snapshot.boss.health / snapshot.boss.maxHealth) * 100}%`);
    }
    this.scope.classList.toggle('visible', Boolean(snapshot.scoped));
    this.root.classList.toggle('scoped', Boolean(snapshot.scoped));
    this.root.style.setProperty('--reticle-spread', `${snapshot.reticleSpread ?? 22}px`);
  }

  showBanner(title: string, subtitle: string, duration = 2.2): void {
    this.bannerTitle.textContent = title;
    this.bannerSubtitle.textContent = subtitle;
    this.banner.classList.add('visible');
    this.bannerTimer = duration;
  }

  showTip(message: string, duration = 4): void {
    this.tip.textContent = message;
    this.tip.classList.add('visible');
    this.tipTimer = duration;
  }

  flashHit(headshot = false): void {
    this.hitMarker.classList.toggle('headshot', headshot);
    this.hitMarker.classList.add('visible');
    this.hitTimer = headshot ? 0.18 : 0.11;
  }

  flashDamage(screenAngleRadians: number, damageAmount: number): void {
    const body = this.root;
    this.damageStack = accumulateDamageStrength(this.damageStack, damageAmount);
    body.style.setProperty('--damage-strength', this.damageStack.toFixed(3));
    body.classList.remove('player-hit');
    void body.offsetWidth;
    body.classList.add('player-hit');

    const marker = this.root.ownerDocument.createElement('i');
    const radius = 124;
    marker.style.left = `${130 + Math.sin(screenAngleRadians) * radius}px`;
    marker.style.top = `${130 - Math.cos(screenAngleRadians) * radius}px`;
    marker.style.transform = `translate(-50%,-50%) rotate(${screenAngleRadians}rad)`;
    this.damageIndicator.append(marker);
    this.damageChevrons.push({ element: marker, remaining: 0.68 });
    while (this.damageChevrons.length > 4) this.damageChevrons.shift()?.element.remove();
    this.damageIndicator.classList.add('visible');
    this.damageTimer = 0.68;
  }

  clearDamageFeedback(): void {
    this.damageTimer = 0;
    this.damageStack = 0;
    this.root.classList.remove('player-hit');
    this.root.style.setProperty('--damage-strength', '0');
    for (const marker of this.damageChevrons) marker.element.remove();
    this.damageChevrons.length = 0;
    this.damageIndicator.classList.remove('visible');
  }

  update(dt: number): void {
    this.bannerTimer -= dt;
    this.tipTimer -= dt;
    this.hitTimer -= dt;
    this.damageTimer -= dt;
    this.damageStack *= Math.exp(-DAMAGE_STACK_DECAY_PER_SECOND * dt);
    for (let index = this.damageChevrons.length - 1; index >= 0; index -= 1) {
      const marker = this.damageChevrons[index];
      marker.remaining -= dt;
      if (marker.remaining > 0) continue;
      marker.element.remove();
      this.damageChevrons.splice(index, 1);
    }
    if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    if (this.tipTimer <= 0) this.tip.classList.remove('visible');
    if (this.hitTimer <= 0) this.hitMarker.classList.remove('visible');
    if (this.damageTimer <= 0) {
      this.damageStack = 0;
      this.root.classList.remove('player-hit');
    }
    this.damageIndicator.classList.toggle('visible', this.damageChevrons.length > 0);
  }
}
