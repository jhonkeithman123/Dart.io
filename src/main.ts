/** Bootstrap, fixed-timestep 60Hz accumulator loop, and system wiring. */

import './ui/styles.css';
import { SIM } from './core/constants';
import type { EventListener, GameEvent, InputCommand } from './core/types';
import type { GameConfig } from './core/GameModes';
import { rollDraft } from './core/UpgradePool';
import { LocalLoopAdapter } from './network/LocalLoopAdapter';
import type { TransportAdapter } from './network/TransportAdapter';
import { SceneManager } from './render/SceneManager';
import { InputManager } from './input/InputManager';
import { SoundFX } from './audio/SoundFX';
import { Menu, type MenuSelection } from './ui/Menu';
import { HUD } from './ui/HUD';
import { DraftModal } from './ui/DraftModal';
import { Joysticks } from './ui/Joysticks';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const uiRoot = document.querySelector<HTMLElement>('#ui-root')!;

const scene = new SceneManager(canvas);
const input = new InputManager(canvas, scene);
const sound = new SoundFX();
const hud = new HUD(uiRoot);
const draft = new DraftModal(uiRoot, (id) => {
  const world = transport?.getWorld();
  const player = world?.state.player;
  if (world && player) world.chooseUpgrade(player, id);
});
const joysticks = new Joysticks(uiRoot);

hud.hide();
void scene.tryWebGPU();

let transport: TransportAdapter | null = null;
let unsubs: Array<() => void> = [];
let gameOverShown = false;
let devPaused = false;
let lastSelection: MenuSelection = { mode: 'endless', archetype: 'archer', theme: 'classic' };

const menu = new Menu(uiRoot, (selection) => {
  lastSelection = selection;
  sound.unlock();
  startMatch(selection);
});

function startMatch(selection: MenuSelection): void {
  for (const off of unsubs) off();
  unsubs = [];
  draft.hide();
  hud.hideGameOver();
  gameOverShown = false;

  const config: GameConfig = {
    mode: selection.mode,
    archetype: selection.archetype,
    difficulty: 'normal',
    themeId: selection.theme,
  };
  transport = new LocalLoopAdapter(config);
  const world = transport.start();
  input.setWorld(world);
  scene.setMap(world.map.walls, world.map.halfSize, selection.theme);
  scene.buildWalls(world.map.walls);

  hud.show();
  hud.showBanner(world.controller.rules.name, 'Survive the arena');
  menu.hide();
  wireEvents();
}

/** Tear down the current match and return to the main menu. */
function goHome(): void {
  for (const off of unsubs) off();
  unsubs = [];
  transport?.stop();
  transport = null;
  draft.hide();
  hud.hide();
  scene.clearWorld();
  gameOverShown = false;
  accumulator = 0;
  menu.show();
}

function wireEvents(): void {
  const world = transport!.getWorld();
  const on = (type: string, fn: EventListener) => unsubs.push(world.state.events.on(type, fn));

  on('shoot', (e: GameEvent) => sound.shoot(String(e.weapon)));
  on('muzzle', (e: GameEvent) => {
    const color = e.weapon === 'laser' ? 0x67e8f9 : e.weapon === 'scythe' ? 0xe0f2fe : 0xfacc15;
    scene.particles.burst(Number(e.x), Number(e.z), color, 5, 2.5, 1.0);
  });
  on('explosion', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0xfb923c, 30, 8, 0.9);
    scene.particles.ring(Number(e.x), Number(e.z), 0xf97316);
  });
  on('chain', (e: GameEvent) => {
    const from = e.from as { x: number; z: number };
    const to = e.to as { x: number; z: number };
    for (let i = 0; i <= 6; i++) {
      scene.particles.burst(
        from.x + (to.x - from.x) * (i / 6),
        from.z + (to.z - from.z) * (i / 6),
        0x67e8f9, 2, 1.5, 1.1,
      );
    }
  });
  on('hit', (e: GameEvent) => {
    sound.hit(Boolean(e.crit));
    scene.particles.burst(Number(e.x), Number(e.z), e.crit ? 0xfacc15 : 0xf8fafc, e.crit ? 12 : 5, 3.5);
  });
  on('bounce', (e: GameEvent) => {
    sound.bounce();
    scene.particles.ring(Number(e.x), Number(e.z), 0x7dd3fc);
  });
  on('impact', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), e.element === 'fire' ? 0xfb923c : 0xcbd5e1, 5, 3);
  });
  on('xp', (e: GameEvent) => {
    sound.xp(Number(e.value));
    scene.particles.burst(Number(e.x), Number(e.z), 0x22d3ee, 3, 2, 1);
  });
  on('levelup', () => {
    sound.levelUp();
    scene.particles.burst(world.state.player?.pos.x ?? 0, world.state.player?.pos.z ?? 0, 0xfacc15, 22, 6, 1.2);
  });
  on('heart', () => sound.heart());
  on('orb-pickup', (e: GameEvent) => {
    sound.orbPickup(String(e.size));
    const color = e.size === 'large' ? 0x6d28d9 : e.size === 'medium' ? 0x7c3aed : 0x8b5cf6;
    scene.particles.burst(Number(e.x), Number(e.z), color, 18, 5, 1);
    scene.particles.ring(Number(e.x), Number(e.z), color);
  });
  on('orb-absorb', (e: GameEvent) => {
    const color = e.size === 'large' ? 0x6d28d9 : e.size === 'medium' ? 0x7c3aed : 0x8b5cf6;
    scene.particles.burst(Number(e.x), Number(e.z), color, 10, 3, 1.1);
  });
  on('kill-xp', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0xfacc15, 20, 6, 1);
  });
  on('reinforce', (e: GameEvent) => {
    scene.particles.ring(Number(e.x), Number(e.z), 0x38bdf8);
  });
  on('death', (e: GameEvent) => {
    sound.death();
    scene.particles.burst(Number(e.x), Number(e.z), 0xef4444, 24, 7, 0.9);
    const victim = world.state.getEntity(Number(e.victimId));
    const killer = world.state.getEntity(Number(e.killerId));
    if (victim && killer) hud.addKill(`${killer.name}  ➜  ${victim.name}`);
    else if (victim) hud.addKill(`${victim.name} was eliminated`);
  });
  on('kill-streak', (e: GameEvent) => {
    const streak = Number(e.streak);
    const callouts = ['', 'First Blood!', 'Double Kill!!', 'Killing Spree!!!', 'Rampage!!!', 'Unstoppable!!!'];
    hud.addKill(`${callouts[Math.min(streak, callouts.length - 1)] ?? 'Multi Kill!'}  ${e.name ?? ''}`);
    sound.levelUp();
  });
  on('spike-place', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0x8b5cf6, 8, 3, 0.4);
  });
  on('spike-hit', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0xef4444, 10, 4, 0.5);
    sound.hit();
  });
  on('rotating-shuriken-hit', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0xa5f3fc, 6, 3, 1);
  });
  on('rotating-shield-hit', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0x93c5fd, 6, 3, 1);
  });
  on('orbit-hit', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0x67e8f9, 6, 3, 0.9);
  });
  on('melee-swing', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), e.kind === 'hammer' ? 0xfb923c : 0x67e8f9, 8, 4, 1);
  });
  on('pet-shot', (e: GameEvent) => {
    scene.particles.burst(Number(e.x), Number(e.z), 0xa5f3fc, 3, 2, 1);
  });
  on('zone-shrink', () => {
    sound.zone();
    hud.showBanner('ZONE SHRINKING!', 'Move toward the safe center');
  });
  on('respawn', (e: GameEvent) => {
    scene.particles.ring(Number(e.x), Number(e.z), 0x4ade80);
  });
  on('game-over', (e: GameEvent) => {
    if (gameOverShown) return;
    gameOverShown = true;
    const won = Boolean(String(e.message).toLowerCase().includes('victory'));
    sound.gameOver(won);
    const p = world.state.player;
    window.setTimeout(() => {
      hud.showGameOver(
        String(e.message),
        world.controller.resultLabel,
        p ? `Level ${p.level} · ${p.kills} eliminations · ${Math.round(p.score)} score` : '',
        () => startMatch(lastSelection),
        () => goHome(),
      );
    }, 700);
  });
}

// ------------------------------------------------------------------ game loop

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  let frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > 0.25) frameDt = 0.25;

  if (transport) {
    const world = transport.getWorld();
    const player = world.state.player;

    // Level-up draft pauses the simulation (slow-motion feel).
    if (player && player.pendingDrafts > 0 && !draft.isOpen && !world.controller.finished) {
      const cards = rollDraft(player, world.rng, 3, 'random');
      if (cards.length > 0) draft.show(cards, player.level);
    }

    const paused = devPaused || draft.isOpen || world.controller.finished;
    if (!paused) {
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= SIM.DT && steps < SIM.MAX_CATCHUP_STEPS) {
        const command: InputCommand = input.getInput(world, SIM.DT);
        transport.submitInput(command);
        transport.step();
        accumulator -= SIM.DT;
        steps++;
      }
      if (steps === SIM.MAX_CATCHUP_STEPS) accumulator = 0;
    } else {
      accumulator = 0;
    }

    hud.update(world, frameDt);
    joysticks.update(input);
    scene.sync(world, frameDt);
  } else {
    // Idle menu: render the background so the canvas isn't blank.
    scene.particles.update(frameDt);
    scene.renderer.render(scene.scene, scene.camera);
  }
}

window.addEventListener('resize', () => scene.resize());

// Dev-only inspection hook for debugging/smoke tests.
if (import.meta.env.DEV) {
  (window as unknown as { __dart: unknown }).__dart = {
    getWorld: () => transport?.getWorld(),
    getScene: () => scene,
    getJoysticks: () => joysticks,
    setPaused: (value: boolean) => { devPaused = value; },
    getInput: () => {
      const world = transport?.getWorld();
      return world ? input.getInput(world, 0) : null;
    },
    /** Force a draft offer (useful for inspecting rarity tiers). */
    roll: () => {
      const world = transport?.getWorld();
      const player = world?.state.player;
      return world && player ? rollDraft(player, world.rng, 3, 'random') : [];
    },
    showCards: (cards: Parameters<typeof draft.show>[0]) => {
      const level = transport?.getWorld().state.player?.level ?? 0;
      draft.show(cards, level);
    },
  };
}
requestAnimationFrame(frame);
