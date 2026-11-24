/** Main menu: mode/archetype/theme selection with a live rotating 3D character preview. */

import * as THREE from 'three';
import type { ArchetypeId, Entity, GameModeId, WeaponKind } from '../core/types';
import { ARCHETYPES, BASE_STATS, MOVEMENT, heightForLevel } from '../core/constants';
import { formatHeight, formatSpeed } from '../core/Units';
import { THEMES } from '../core/MapData';
import { EntityVisual } from '../render/VoxelBuilder';
import { unitSettings } from './UnitSettings';

export interface MenuSelection {
  mode: GameModeId;
  archetype: ArchetypeId;
  theme: string;
}

const MODES: Array<{ id: GameModeId; name: string; tag: string; img: string; desc: string }> = [
  { id: 'endless', name: 'Endless Arena', tag: 'CLASSIC SURVIVAL', img: 'modes/EndlessArena.jpg',
    desc: 'No time limit. Survive, climb the leaderboard, and chase your high score.' },
  { id: 'battle_royale', name: 'Battle Royale', tag: 'LAST ONE STANDING', img: 'modes/BattleRoyale.jpg',
    desc: '24 fighters, one life. Dodge the shrinking danger barrier.' },
  { id: 'blitz', name: '3-Minute Blitz', tag: 'TIME ATTACK', img: 'modes/3-MinuteBlitz.jpg',
    desc: '180 seconds, instant respawns, 2× XP. Highest score wins.' },
];

function makePreviewEntity(archId: string): Entity {
  const arch = ARCHETYPES[archId];
  return {
    id: 0, isBot: false, difficulty: 'easy', alive: true,
    name: arch.name, archetype: archId as Entity['archetype'],
    weapon: arch.weapon as Entity['weapon'],
    arsenal: [arch.weapon as WeaponKind],
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, facing: 0, radius: 0.55,
    stats: { ...BASE_STATS, fireRate: 1 }, hp: 100,
    level: 0, xp: 0, xpToNext: 10, pendingDrafts: 0,
    kills: 0, score: 0, killStreak: 0, lastKillTime: 0, orbitHitTimes: new Map<number, number>(), shurikenHitTimes: new Map<number, number>(), shieldHitTimes: new Map<number, number>(), respawnTimer: 0, fireCooldown: 0,
    upgrades: {}, element: 'none', slowUntil: 0, slowFactor: 1,
    burnUntil: 0, burnDps: 0, hitFlash: 0, invulnUntil: 0,
    brainTimer: 0,
    brain: {
      feelers: [], steerX: 0, steerZ: 0, desiredAimX: 1, desiredAimZ: 0,
      firing: false, targetId: 0, tacticalState: 'forage',
    },
  } as Entity;
}

export class Menu {
  readonly el: HTMLDivElement;
  private selection: MenuSelection = { mode: 'endless', archetype: 'archer', theme: 'classic' };
  private onStart: (selection: MenuSelection) => void;

  private visible = true;
  private previewRenderer: THREE.WebGLRenderer;
  private previewScene = new THREE.Scene();
  private previewCamera: THREE.PerspectiveCamera;
  private previewGroup = new THREE.Group();
  private previewVisual: EntityVisual | null = null;
  private previewCanvas: HTMLCanvasElement;
  private infoEl: HTMLElement;
  private charPageEl: HTMLDivElement;
  private charPageRenderer: THREE.WebGLRenderer;
  private charPageScene = new THREE.Scene();
  private charPageCamera: THREE.PerspectiveCamera;
  private charPageGroup = new THREE.Group();
  private charPageVisual: EntityVisual | null = null;
  private charPageInfoEl: HTMLElement;
  private stagedArch: ArchetypeId;
  private charPageOpen = false;
  private modeIndex = 0;
  private modeTrack: HTMLElement;
  private raf = 0;
  private lastFrame = performance.now();
  private offUnits: () => void;

  constructor(root: HTMLElement, onStart: (selection: MenuSelection) => void) {
    this.onStart = onStart;
    this.el = document.createElement('div');
    this.el.id = 'menu';
    this.el.innerHTML = this.markup();
    root.appendChild(this.el);

    // Dedicated character-select page, appended outside #menu so it can overlay it.
    this.charPageEl = document.createElement('div');
    this.charPageEl.id = 'charpage';
    this.charPageEl.className = 'hidden';
    this.charPageEl.innerHTML = this.charPageMarkup();
    root.appendChild(this.charPageEl);
    this.stagedArch = this.selection.archetype;

    this.previewCanvas = this.el.querySelector<HTMLCanvasElement>('#char-preview')!;
    this.infoEl = this.el.querySelector<HTMLElement>('#char-info')!;
    this.previewRenderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, alpha: true });
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.previewRenderer.setSize(320, 280, false);
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.previewCamera = new THREE.PerspectiveCamera(38, 320 / 280, 0.1, 50);
    this.previewCamera.position.set(0, 2.8, 7.2);
    this.previewCamera.lookAt(0, 1.15, 0);
    this.previewScene.add(this.previewGroup);
    this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 6, 4);
    this.previewScene.add(key);

    // Character page: its own renderer/scene so the menu preview can idle behind it.
    this.charPageInfoEl = this.charPageEl.querySelector<HTMLElement>('#charpage-info')!;
    const charCanvas = this.charPageEl.querySelector<HTMLCanvasElement>('#charpage-canvas')!;
    this.charPageRenderer = new THREE.WebGLRenderer({ canvas: charCanvas, antialias: true, alpha: true });
    this.charPageRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.charPageRenderer.setSize(460, 380, false);
    this.charPageRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.charPageCamera = new THREE.PerspectiveCamera(38, 460 / 380, 0.1, 50);
    this.charPageCamera.position.set(0, 2.8, 7.2);
    this.charPageCamera.lookAt(0, 1.15, 0);
    this.charPageScene.add(this.charPageGroup);
    this.charPageScene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 2.2));
    const charKey = new THREE.DirectionalLight(0xffffff, 2.4);
    charKey.position.set(-3, 6, 4);
    this.charPageScene.add(charKey);

    this.bind();
    this.modeTrack = this.el.querySelector<HTMLElement>('.mode-track')!;
    this.setModeIndex(0);
    this.setPreview(this.selection.archetype);
    this.refresh();
    this.offUnits = unitSettings.onChange(() => this.setPreview(this.selection.archetype));
    this.animate();
  }

  private markup(): string {
    const modeSlides = MODES.map((m) => `
      <div class="mode-slide" data-mode="${m.id}">
        <img class="banner-img" src="${m.img}" alt="" />
        <div class="banner-fx"></div>
        <div class="banner-content">
          <span class="mode-tag">${m.tag}</span>
          <h2 class="mode-title">${m.name.toUpperCase()}</h2>
        </div>
        <button class="info-btn" aria-label="${m.name} info">i</button>
        <div class="info-drawer"><p>${m.desc}</p></div>
      </div>`).join('');
    const dots = MODES.map((_, i) => `<span class="dot" data-i="${i}"></span>`).join('');
    const themes = THEMES.map((t) => `
      <button class="btn theme-chip" data-theme="${t.id}">${t.name}</button>`).join('');
    return `
      <img class="logo-img" id="menu-logo" src="Logo.jpg" alt="Dart.io" />
      <div class="tagline">3D voxel arena shooter · offline bots · 60 FPS</div>
      <div class="menu-layout">
        <div class="menu-controls">
          <div class="menu-section">
            <h3>Game Mode</h3>
            <div class="mode-carousel">
              <button class="nav-arrow prev" aria-label="Previous Mode">‹</button>
              <div class="mode-banner">
                <div class="mode-track">${modeSlides}</div>
              </div>
              <button class="nav-arrow next" aria-label="Next Mode">›</button>
            </div>
            <div class="mode-dots">${dots}</div>
          </div>
          <div class="menu-section">
            <h3>Theme</h3>
            <div class="theme-row">${themes}</div>
          </div>
        </div>
        <div class="menu-preview">
          <canvas id="char-preview"></canvas>
          <div id="char-info"></div>
          <div class="preview-actions">
            <button class="btn choose-btn" id="choose-btn">CHOOSE CHARACTER</button>
          </div>
        </div>
      </div>
      <div class="menu-footer">
        <button class="btn primary" id="start-btn">▶ PLAY</button>
        <span class="tagline" style="margin:0">WASD walk · right joystick aims and fires on release · arrows also aim</span>
      </div>`;
  }

  private charPageMarkup(): string {
    const cards = Object.values(ARCHETYPES).map((a) => `
      <button class="char-select" data-arch="${a.id}">
        <strong>${a.name}</strong>
        <small>${a.weapon.toUpperCase()}</small>
      </button>`).join('');
    return `
      <div class="charpage-head">
        <button class="btn" id="char-back">← BACK</button>
        <h2>SELECT YOUR CHARACTER</h2>
        <div class="tagline" style="margin:0">Every character walks the same speed · 1 attack per second</div>
      </div>
      <div class="charpage-body">
        <div class="charpage-list">${cards}</div>
        <div class="charpage-detail">
          <canvas id="charpage-canvas" width="460" height="380"></canvas>
          <div id="charpage-info"></div>
        </div>
      </div>
      <div class="charpage-foot">
        <button class="btn primary" id="char-confirm">SELECT CHARACTER</button>
      </div>`;
  }

  private bind(): void {
    // If Logo.jpg is missing/unloadable, fall back to the original text logo.
    // While hovering the banner, swap in the animated Logo.gif; restore the still on leave.
    const logo = this.el.querySelector<HTMLImageElement>('#menu-logo');
    const STATIC_LOGO = 'Logo.jpg';
    const ANIM_LOGO = 'Logo.gif';
    if (logo) {
      logo.addEventListener('error', () => {
        // The animated version failing just means no hover animation — keep the still.
        if (logo.getAttribute('src') === ANIM_LOGO) { logo.src = STATIC_LOGO; return; }
        const div = document.createElement('div');
        div.className = 'logo';
        div.innerHTML = 'DART<span style="color:#f472b6">.</span>IO';
        logo.replaceWith(div);
      });
      logo.addEventListener('mouseenter', () => { logo.src = ANIM_LOGO; });
      logo.addEventListener('mouseleave', () => { logo.src = STATIC_LOGO; });
      // Preload the 3.3 MB gif once the page has fully loaded so the first hover is instant.
      const preloadAnim = () => { new Image().src = ANIM_LOGO; };
      if (document.readyState === 'complete') preloadAnim();
      else window.addEventListener('load', preloadAnim, { once: true });
    }

    this.el.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) => {
      b.addEventListener('click', () => { this.selection.theme = b.dataset.theme!; this.refresh(); });
    });
    // Mode carousel: arrows, dots, and the info drawer.
    this.el.querySelector<HTMLButtonElement>('.nav-arrow.prev')!
      .addEventListener('click', () => this.setModeIndex(this.modeIndex - 1));
    this.el.querySelector<HTMLButtonElement>('.nav-arrow.next')!
      .addEventListener('click', () => this.setModeIndex(this.modeIndex + 1));
    this.el.querySelectorAll<HTMLElement>('.dot').forEach((d) =>
      d.addEventListener('click', () => this.setModeIndex(Number(d.dataset.i))));
    this.el.querySelectorAll<HTMLButtonElement>('.info-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.nextElementSibling?.classList.toggle('open');
      });
    });
    this.el.querySelectorAll<HTMLElement>('.info-drawer').forEach((d) => {
      d.addEventListener('click', () => d.classList.remove('open'));
    });
    this.el.querySelector<HTMLButtonElement>('#start-btn')!.addEventListener('click', () => {
      this.onStart({ ...this.selection });
    });

    // Character page: open / browse / confirm / back.
    this.el.querySelector<HTMLButtonElement>('#choose-btn')!.addEventListener('click', () => this.openCharPage());
    this.charPageEl.querySelector<HTMLButtonElement>('#char-back')!.addEventListener('click', () => this.closeCharPage(false));
    this.charPageEl.querySelector<HTMLButtonElement>('#char-confirm')!.addEventListener('click', () => this.closeCharPage(true));
    this.charPageEl.querySelectorAll<HTMLButtonElement>('.char-select').forEach((b) => {
      b.addEventListener('click', () => {
        this.stagedArch = b.dataset.arch as ArchetypeId;
        this.refreshCharPage();
      });
    });
  }

  private openCharPage(): void {
    this.stagedArch = this.selection.archetype;
    this.charPageEl.classList.remove('hidden');
    this.charPageOpen = true;
    this.refreshCharPage();
  }

  /** Close the character page; when `apply` is true the staged pick becomes the selection. */
  private closeCharPage(apply: boolean): void {
    if (apply) {
      this.selection.archetype = this.stagedArch;
      this.setPreview(this.selection.archetype);
    }
    this.charPageEl.classList.add('hidden');
    this.charPageOpen = false;
  }

  private refreshCharPage(): void {
    this.charPageEl.querySelectorAll<HTMLButtonElement>('.char-select').forEach((b) =>
      b.classList.toggle('selected', b.dataset.arch === this.stagedArch));
    this.setCharPageModel(this.stagedArch);
    this.charPageInfoEl.innerHTML = this.infoMarkup(this.stagedArch);
  }

  /** Swap the rotating model shown on the character page. */
  private setCharPageModel(archId: string): void {
    if (this.charPageVisual) {
      this.charPageGroup.remove(this.charPageVisual.group);
      this.charPageVisual.dispose();
    }
    this.charPageVisual = new EntityVisual(makePreviewEntity(archId));
    this.charPageVisual.showLabels(false);
    this.charPageVisual.group.scale.setScalar(1.3);
    this.charPageGroup.add(this.charPageVisual.group);
  }

  private refresh(): void {
    this.setModeIndex(this.modeIndex);
    this.el.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) =>
      b.classList.toggle('selected', b.dataset.theme === this.selection.theme));
  }

  /** Slide the mode carousel (wraps) and make that mode the active selection. */
  private setModeIndex(i: number): void {
    const n = MODES.length;
    this.modeIndex = ((i % n) + n) % n;
    this.selection.mode = MODES[this.modeIndex].id;
    if (this.modeTrack) this.modeTrack.style.transform = `translateX(-${this.modeIndex * 100}%)`;
    this.el.querySelectorAll<HTMLElement>('.dot').forEach((d, idx) =>
      d.classList.toggle('active', idx === this.modeIndex));
    // Navigating dismisses any open description overlay.
    this.el.querySelectorAll<HTMLElement>('.info-drawer.open').forEach((d) => d.classList.remove('open'));
  }

  /** Shared stats/description block for the menu preview and the character page. */
  private infoMarkup(archId: string): string {
    const arch = ARCHETYPES[archId];
    const system = unitSettings.system;
    return `
      <h3>${arch.name}</h3>
      <div class="info-row"><span>WEAPON</span><b>${arch.ability}</b></div>
      <div class="info-row"><span>ABILITY</span><b>${arch.ability}</b></div>
      <div class="info-row"><span>PASSIVE</span><b>${arch.passive}</b></div>
      <div class="info-row"><span>HEIGHT</span><b>${formatHeight(heightForLevel(0), system)}</b></div>
      <div class="info-note">
        ${arch.description}<br><br>
        All characters: ${formatSpeed(MOVEMENT.BASE_SPEED, system)} fixed move speed ·
        1 attack / second when firing · larger characters walk slower.
      </div>`;
  }

  private setPreview(archId: string): void {
    if (this.previewVisual) {
      this.previewGroup.remove(this.previewVisual.group);
      this.previewVisual.dispose();
    }
    this.previewVisual = new EntityVisual(makePreviewEntity(archId));
    this.previewVisual.showLabels(false);
    this.previewVisual.group.scale.setScalar(1.3);
    this.previewGroup.add(this.previewVisual.group);

    this.infoEl.innerHTML = this.infoMarkup(archId);
  }

  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.visible) return;
    this.previewGroup.rotation.y += dt * 0.8;
    this.previewRenderer.render(this.previewScene, this.previewCamera);
    if (this.charPageOpen) {
      this.charPageGroup.rotation.y += dt * 0.8;
      this.charPageRenderer.render(this.charPageScene, this.charPageCamera);
    }
  };

  show(): void {
    this.visible = true;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.el.classList.add('hidden');
    // Never leave the character page open over live gameplay.
    this.charPageEl.classList.add('hidden');
    this.charPageOpen = false;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.offUnits();
    this.previewRenderer.dispose();
    this.charPageVisual?.dispose();
    this.charPageRenderer.dispose();
  }
}
