/** Paused 3-card upgrade draft shown on level-up. */

import type { Upgrade } from '../core/UpgradePool';

const ICONS: Record<string, string> = {
  multishot: '🏹', physics: '🌀', arsenal: '⚔️', weapon: '🎯',
  effect: '✨', pet: '🐾', stats: '💪',
};
const NAMES: Record<string, string> = {
  multishot: 'Multishot & Angles', physics: 'Projectile Physics',
  arsenal: 'Arsenal', weapon: 'Weapon Tuning',
  effect: 'Weapon Effect', pet: 'Sidekick Pet', stats: 'Character Stats',
};
const RARITY_LABELS: Record<string, string> = {
  common: 'COMMON', rare: 'RARE', super_rare: 'SUPER RARE',
};

export class DraftModal {
  readonly el: HTMLDivElement;
  isOpen = false;
  private onPick: (id: string) => void;

  constructor(root: HTMLElement, onPick: (id: string) => void) {
    this.onPick = onPick;
    this.el = document.createElement('div');
    this.el.id = 'draft';
    this.el.classList.add('hidden');
    root.appendChild(this.el);
  }

  show(cards: Upgrade[], level: number): void {
    if (cards.length === 0) return;
    this.isOpen = true;
    this.el.innerHTML = `
      <h2>LEVEL ${level}!</h2>
      <div class="sub">Choose one upgrade — the arena is paused</div>
      <div class="cards">
        ${cards.map((u) => `
          <div class="upgrade-card" data-id="${u.id}">
            <div class="icon">${ICONS[u.category] ?? '✨'}</div>
            <div class="cat">${NAMES[u.category] ?? u.category}</div>
            <div class="name">${u.name}</div>
            <div class="desc">${u.description}</div>
            <div class="rarity ${u.rarity}">${RARITY_LABELS[u.rarity] ?? u.rarity}</div>
          </div>`).join('')}
      </div>`;
    this.el.classList.remove('hidden');
    this.el.querySelectorAll<HTMLElement>('.upgrade-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.id!;
        this.hide();
        this.onPick(id);
      });
    });
  }

  hide(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }
}
