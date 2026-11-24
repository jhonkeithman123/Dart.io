/** Dual-stick input: on-screen joysticks work on both PC (mouse) and mobile (touch). */

import type { InputCommand } from '../core/types';
import type { World } from '../core/World';
import type { SceneManager } from '../render/SceneManager';

export interface Stick {
  active: boolean;
  pointerId: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  downAt: number;
  moved: number;
}

const MAX_RADIUS = 62;
const BASE_X = 140;
const BASE_Y_FROM_BOTTOM = 175;
const BASE_GRAB_RADIUS = 100;
/** A right-stick drag must exceed this before releasing counts as a shot. */
const AIM_DRAG_THRESHOLD = 10;

/** Resting joystick positions — raised and nudged inward from the screen edges. */
export function stickBase(side: 'left' | 'right'): { x: number; y: number } {
  const y = Math.max(180, window.innerHeight - BASE_Y_FROM_BOTTOM);
  return side === 'left'
    ? { x: BASE_X, y }
    : { x: Math.max(180, window.innerWidth - BASE_X), y };
}

function newStick(): Stick {
  return { active: false, pointerId: -1, ox: 0, oy: 0, dx: 0, dy: 0, downAt: 0, moved: 0 };
}

export class InputManager {
  readonly left = newStick();
  readonly right = newStick();
  isTouch = false;

  private keys = new Set<string>();
  /** Last aim direction, used when neither stick nor arrow keys are active. */
  private lastAim = { x: 1, z: 0 };
  /** One-shot fire queue: consumed by the next simulation tick. */
  private fireQueued = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, _scene: SceneManager) {
    this.canvas = canvas;
    this.bind();
  }

  private bind(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.isTouch = true;
      else if (e.pointerType !== 'mouse') return;

      let stick: Stick | null = null;
      let ox = e.clientX;
      let oy = e.clientY;
      if (e.pointerType === 'touch') {
        // Both touch sticks spawn exactly where the finger lands.
        stick = e.clientX < window.innerWidth / 2 ? this.left : this.right;
      } else if (e.clientX > window.innerWidth / 2) {
        // Right stick can appear anywhere on the right half — no need to reach
        // for a fixed corner when you're in a hurry.
        stick = this.right;
      } else {
        // Left stick stays anchored near its resting spot on the left.
        const lb = stickBase('left');
        if (Math.hypot(e.clientX - lb.x, e.clientY - lb.y) > BASE_GRAB_RADIUS) return;
        stick = this.left;
        ox = lb.x;
        oy = lb.y;
      }
      stick.active = true;
      stick.pointerId = e.pointerId;
      stick.ox = ox;
      stick.oy = oy;
      stick.dx = 0;
      stick.dy = 0;
      stick.downAt = performance.now();
      stick.moved = 0;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const stick = this.stickFor(e.pointerId);
      if (!stick) return;
      let dx = e.clientX - stick.ox;
      let dy = e.clientY - stick.oy;
      const l = Math.hypot(dx, dy);
      stick.moved = Math.max(stick.moved, l);
      if (l > MAX_RADIUS) { dx = (dx / l) * MAX_RADIUS; dy = (dy / l) * MAX_RADIUS; }
      stick.dx = dx / MAX_RADIUS;
      stick.dy = dy / MAX_RADIUS;
    });

    const end = (e: PointerEvent) => {
      const stick = this.stickFor(e.pointerId);
      if (!stick) return;
      // Aim first, then fire on release. A bare tap never fires.
      if (stick === this.right && stick.moved >= AIM_DRAG_THRESHOLD) {
        this.fireQueued = true;
      }
      stick.active = false;
      stick.pointerId = -1;
      stick.dx = 0;
      stick.dy = 0;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private stickFor(id: number): Stick | null {
    if (this.left.pointerId === id) return this.left;
    if (this.right.pointerId === id) return this.right;
    return null;
  }

  setWorld(_world: World): void { /* kept for API compatibility */ }

  /** Poll the current intent. Fire is edge-triggered: one shot per aim-stick release. */
  getInput(_world: World, _dt: number): InputCommand {
    let mx = 0;
    let mz = 0;
    // Left stick / WASD = walking.
    if (this.left.active) {
      mx = this.left.dx;
      mz = this.left.dy;
    } else {
      if (this.keys.has('KeyD')) mx += 1;
      if (this.keys.has('KeyA')) mx -= 1;
      if (this.keys.has('KeyS')) mz += 1;
      if (this.keys.has('KeyW')) mz -= 1;
    }

    // Aim follows the right joystick direction on both PC and mobile.
    let ax = this.lastAim.x;
    let az = this.lastAim.z;
    let keyAimX = 0;
    let keyAimZ = 0;
    if (this.keys.has('ArrowRight')) keyAimX += 1;
    if (this.keys.has('ArrowLeft')) keyAimX -= 1;
    if (this.keys.has('ArrowDown')) keyAimZ += 1;
    if (this.keys.has('ArrowUp')) keyAimZ -= 1;

    if (this.right.active) {
      ax = this.right.dx;
      az = this.right.dy;
    } else if (keyAimX !== 0 || keyAimZ !== 0) {
      const kl = Math.hypot(keyAimX, keyAimZ);
      ax = keyAimX / kl;
      az = keyAimZ / kl;
    }
    const aimLength = Math.hypot(ax, az);
    if (aimLength > 0.01) {
      ax /= aimLength;
      az /= aimLength;
      this.lastAim = { x: ax, z: az };
    }

    const firePressed = this.fireQueued;
    this.fireQueued = false;
    return {
      moveX: mx, moveZ: mz, aimX: ax, aimZ: az,
      firing: false,
      firePressed,
    };
  }
}
