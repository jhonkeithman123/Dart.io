/** In-match HUD: health/XP, timer, score, leaderboard, kill feed and overlays. */

import type { World } from '../core/World';
import { heightForLevel } from '../core/constants';
import { formatDistance, formatHeight, formatScale, formatSpeed } from '../core/Units';
import { unitSettings } from './UnitSettings';

function el<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`HUD element not found: ${selector}`);
  return found;
}

export class HUD {
  readonly el: HTMLDivElement;
  private hpBars: HTMLElement;
  private hpSegments: HTMLElement[] = [];
  private hpSegmentCount = 0;
  private xp: HTMLElement;
  private level: HTMLElement;
  private timer: HTMLElement;
  private score: HTMLElement;
  private kills: HTMLElement;
  private mode: HTMLElement;
  private leaderboard: HTMLElement;
  private feed: HTMLElement;
  private bannerEl: HTMLElement;
  private gameover: HTMLDivElement;
  private unitButton: HTMLButtonElement;
  private scaleLabel: HTMLElement;
  private bodyLabel: HTMLElement;
  private xpLabel: HTMLElement;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-name"><span id="hud-mode">ENDLESS ARENA</span> · Lv <span id="hud-level">0</span>/20 <span id="hud-you"></span></div>
        <div class="hp-bars" id="hp-bars"></div>
        <div class="bar" id="xp-bar"><span></span></div>
        <div class="bar-label" id="hud-xp-label">HEALTH / EXPERIENCE</div>
        <div class="unit-box">
          <button class="unit-toggle" id="hud-units" type="button">IMPERIAL</button>
          <span id="hud-scale">1 unit = 1 m = 39.37 in</span>
          <span id="hud-body">5 ft 11 in · 11.8 ft/s</span>
        </div>
      </div>
      <div class="hud-top-right">
        <div class="timer" id="hud-timer">∞</div>
        <div class="score" id="hud-score">SCORE 0</div>
        <div class="kills" id="hud-kills">0 eliminations</div>
        <div class="leaderboard" id="hud-lb"><h4>LEADERBOARD</h4></div>
      </div>
      <div class="hud-bottom-left"><div class="kill-feed" id="hud-feed"></div></div>
      <div class="hint" id="hud-hint">WASD walk · RIGHT joystick aims and fires (drag then release) · arrows also aim</div>`;
    root.appendChild(this.el);

    this.hpBars = el(this.el, '#hp-bars');
    this.xp = el(this.el, '#xp-bar > span');
    this.level = el(this.el, '#hud-level');
    this.timer = el(this.el, '#hud-timer');
    this.score = el(this.el, '#hud-score');
    this.kills = el(this.el, '#hud-kills');
    this.mode = el(this.el, '#hud-mode');
    this.leaderboard = el(this.el, '#hud-lb');
    this.feed = el(this.el, '#hud-feed');
    this.unitButton = el(this.el, '#hud-units');
    this.scaleLabel = el(this.el, '#hud-scale');
    this.bodyLabel = el(this.el, '#hud-body');
    this.xpLabel = el(this.el, '#hud-xp-label');
    this.unitButton.addEventListener('click', () => unitSettings.toggle());
    unitSettings.onChange(() => this.renderUnits());
    this.renderUnits();

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'banner hidden';
    this.el.appendChild(this.bannerEl);

    this.gameover = document.createElement('div');
    this.gameover.id = 'gameover';
    this.gameover.classList.add('hidden');
    root.appendChild(this.gameover);
  }

  private currentPlayer: World['state']['player'] = undefined;

  private renderUnits(): void {
    const system = unitSettings.system;
    this.unitButton.textContent = system === 'imperial' ? 'IMPERIAL' : 'METRIC';
    this.scaleLabel.textContent = formatScale(system);
    const p = this.currentPlayer;
    if (p) {
      this.bodyLabel.textContent =
        `${formatHeight(heightForLevel(p.level), system)} · ${formatSpeed(p.stats.moveSpeed, system)}`;
    }
  }

  setHint(text: string): void {
    el(this.el, '#hud-hint').textContent = text;
  }

  showBanner(title: string, sub = ''): void {
    this.bannerEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.style.animation = 'none';
    void this.bannerEl.offsetWidth;
    this.bannerEl.style.animation = '';
    this.bannerTimer = 2.6;
  }

  addKill(text: string): void {
    const row = document.createElement('div');
    row.textContent = text;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild!.remove();
    window.setTimeout(() => row.remove(), 4000);
  }

  update(world: World, dt: number): void {
    const p = world.state.player;
    if (!p) return;
    this.currentPlayer = p;
    this.renderUnits();
    this.mode.textContent = world.controller.rules.name.toUpperCase();
    this.level.textContent = String(p.level);
    el(this.el, '#hud-you').innerHTML = p.alive ? '' : '<span class="zone-warning">DEAD</span>';
    const bars = Math.ceil(p.stats.maxHp);
    if (bars !== this.hpSegmentCount) {
      this.hpBars.innerHTML = '';
      this.hpSegments = [];
      for (let i = 0; i < bars; i++) {
        const segment = document.createElement('div');
        segment.className = 'hp-segment';
        this.hpBars.appendChild(segment);
        this.hpSegments.push(segment);
      }
      this.hpSegmentCount = bars;
    }
    const low = p.hp <= 1;
    this.hpBars.classList.toggle('low', low);
    for (let i = 0; i < this.hpSegments.length; i++) {
      this.hpSegments[i].style.setProperty('--fill', `${Math.max(0, Math.min(1, p.hp - i)) * 100}%`);
    }
    this.xp.style.width = `${Math.min(100, (p.xp / Math.max(1, p.xpToNext)) * 100)}%`;
    this.xpLabel.textContent = p.level >= 20
      ? 'MAX LEVEL · HEALTH / EXPERIENCE'
      : `HEALTH / EXP ${Math.floor(p.xp)}/${p.xpToNext} TO LV ${p.level + 1}`;
    this.score.textContent = `SCORE ${Math.round(p.score)}`;
    this.kills.textContent = `${p.kills} elimination${p.kills === 1 ? '' : 's'}`;

    if (world.controller.timeLimit > 0) {
      const r = world.controller.remaining;
      const mm = String(Math.floor(r / 60)).padStart(2, '0');
      const ss = String(Math.floor(r % 60)).padStart(2, '0');
      this.timer.textContent = `${mm}:${ss}`;
    } else {
      const z = world.state.zone;
      this.timer.textContent = z.active
        ? `ZONE ${formatDistance(z.radius, unitSettings.system)}`
        : '∞';
    }

    const board = world.getLeaderboard(6);
    this.leaderboard.innerHTML = '<h4>LEADERBOARD</h4>' + board.map((e, i) =>
      `<div class="lb-row ${e.isBot ? '' : 'me'}"><span>${i + 1}. ${e.name}</span><span>${Math.round(e.score)}</span></div>`,
    ).join('');

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden');
    }
  }

  showGameOver(
    message: string,
    result: string,
    stats: string,
    onRestart: () => void,
    onHome: () => void,
  ): void {
    this.gameover.innerHTML = `
      <h1>${message}</h1>
      <div class="result">${result}</div>
      <div class="stats">${stats}</div>
      <div class="gameover-actions">
        <button class="btn primary" id="restart-btn">↻ PLAY AGAIN</button>
        <button class="btn" id="home-btn">⌂ BACK TO HOME</button>
      </div>`;
    this.gameover.classList.remove('hidden');
    this.gameover.querySelector('#restart-btn')!.addEventListener('click', onRestart);
    this.gameover.querySelector('#home-btn')!.addEventListener('click', onHome);
  }

  hideGameOver(): void { this.gameover.classList.add('hidden'); }

  show(): void { this.el.classList.remove('hidden'); }
  hide(): void { this.el.classList.add('hidden'); this.hideGameOver(); }
}
