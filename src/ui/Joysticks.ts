/** Visual feedback for the dual joysticks — shown on both PC and touch devices. */

import { stickBase, type InputManager, type Stick } from '../input/InputManager';

const RADIUS = 62;

function makeBase(): { base: HTMLDivElement; knob: HTMLDivElement } {
  const base = document.createElement('div');
  base.className = 'joy-base';
  const knob = document.createElement('div');
  knob.className = 'joy-knob';
  base.appendChild(knob);
  return { base, knob };
}

export class Joysticks {
  private container: HTMLDivElement;
  private left = makeBase();
  private right = makeBase();

  constructor(root: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'joysticks';
    this.container.appendChild(this.left.base);
    this.container.appendChild(this.right.base);
    root.appendChild(this.container);
  }

  private place(visual: { base: HTMLDivElement; knob: HTMLDivElement }, stick: Stick, fixed: { x: number; y: number }): void {
    const { x, y } = stick.active ? { x: stick.ox, y: stick.oy } : fixed;
    visual.base.style.display = 'block';
    visual.base.style.left = `${x}px`;
    visual.base.style.top = `${y}px`;
    visual.base.style.opacity = stick.active ? '1' : '0.55';
    visual.knob.style.transform = `translate(calc(-50% + ${stick.dx * RADIUS}px), calc(-50% + ${stick.dy * RADIUS}px))`;
  }

  update(input: InputManager): void {
    this.container.style.display = 'block';
    this.place(this.left, input.left, stickBase('left'));
    this.place(this.right, input.right, stickBase('right'));
  }
}
