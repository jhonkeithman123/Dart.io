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

const MODES: Array<{ id: GameModeId; name: string; desc: string }> = [
  { id: 'endless', name: 'Endless Arena', desc: 'No time limit. Survive, climb the leaderboard, chase your high score.' },
  { id: 'battle_royale', name: 'Battle Royale', desc: '24 fighters, one life. Dodge the shrinking danger barrier.' },
  { id: 'blitz', name: '3-Minute Blitz', desc: '180 seconds, instant respawns, 2× XP. Highest score wins.' },
];

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

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
  private raf = 0;
  private lastFrame = performance.now();
  private offUnits: () => void;

  constructor(root: HTMLElement, onStart: (selection: MenuSelection) => void) {
    this.onStart = onStart;
    this.el = document.createElement('div');
    this.el.id = 'menu';
    this.el.innerHTML = this.markup();
    root.appendChild(this.el);

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

    this.bind();
    this.setPreview(this.selection.archetype);
    this.refresh();
    this.offUnits = unitSettings.onChange(() => this.setPreview(this.selection.archetype));
    this.animate();
  }

  private markup(): string {
    const modeCards = MODES.map((m) => `
      <button class="btn mode-card" data-mode="${m.id}">
        <strong>${m.name}</strong><small>${m.desc}</small>
      </button>`).join('');
    const charCards = Object.values(ARCHETYPES).map((a) => `
      <button class="btn char-card" data-arch="${a.id}">
        <strong><span class="swatch" style="background:${hex(a.color)}"></span>${a.name}</strong>
        <small>${a.weapon.toUpperCase()}</small>
      </button>`).join('');
    const themes = THEMES.map((t) => `
      <button class="btn" data-theme="${t.id}">${t.name}</button>`).join('');
    return `
      <div class="logo">DART<span style="color:#f472b6">.</span>IO</div>
      <div class="tagline">3D voxel arena shooter · offline bots · 60 FPS</div>
      <div class="menu-layout">
        <div class="menu-controls">
          <div class="menu-section">
            <h3>Game Mode</h3>
            <div class="mode-row">${modeCards}</div>
          </div>
          <div class="menu-section">
            <h3>Character</h3>
            <div class="char-row">${charCards}</div>
          </div>
          <div class="menu-section">
            <h3>Theme</h3>
            <div class="theme-row">${themes}</div>
          </div>
        </div>
        <div class="menu-preview">
          <canvas id="char-preview"></canvas>
          <div id="char-info"></div>
        </div>
      </div>
      <div class="menu-footer">
        <button class="btn primary" id="start-btn">▶ PLAY</button>
        <span class="tagline" style="margin:0">WASD walk · right joystick aims and fires on release · arrows also aim</span>
      </div>`;
  }

  private bind(): void {
    this.el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => { this.selection.mode = b.dataset.mode as GameModeId; this.refresh(); });
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-arch]').forEach((b) => {
      b.addEventListener('click', () => {
        this.selection.archetype = b.dataset.arch as ArchetypeId;
        this.setPreview(this.selection.archetype);
        this.refresh();
      });
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) => {
      b.addEventListener('click', () => { this.selection.theme = b.dataset.theme!; this.refresh(); });
    });
    this.el.querySelector<HTMLButtonElement>('#start-btn')!.addEventListener('click', () => {
      this.onStart({ ...this.selection });
    });
  }

  private refresh(): void {
    this.el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.classList.toggle('selected', b.dataset.mode === this.selection.mode));
    this.el.querySelectorAll<HTMLButtonElement>('[data-arch]').forEach((b) =>
      b.classList.toggle('selected', b.dataset.arch === this.selection.archetype));
    this.el.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) =>
      b.classList.toggle('selected', b.dataset.theme === this.selection.theme));
  }

  private setPreview(archId: string): void {
    const arch = ARCHETYPES[archId];
    if (this.previewVisual) {
      this.previewGroup.remove(this.previewVisual.group);
      this.previewVisual.dispose();
    }
    this.previewVisual = new EntityVisual(makePreviewEntity(archId));
    this.previewVisual.showLabels(false);
    this.previewVisual.group.scale.setScalar(1.3);
    this.previewGroup.add(this.previewVisual.group);

    const system = unitSettings.system;
    this.infoEl.innerHTML = `
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

  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.visible) return;
    this.previewGroup.rotation.y += dt * 0.8;
    this.previewRenderer.render(this.previewScene, this.previewCamera);
  };

  show(): void {
    this.visible = true;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.offUnits();
    this.previewRenderer.dispose();
  }
}
