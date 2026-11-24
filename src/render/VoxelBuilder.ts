/**
 * Procedural voxel character rigs, weapons, nameplates and health bars (§3).
 * No external art assets — everything is built from primitives.
 */

import * as THREE from 'three';
import type { ArchetypeId, Entity } from '../core/types';
import { ARCHETYPES, sizeForLevel } from '../core/constants';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const GOLD = new THREE.OctahedronGeometry(0.5, 0);
const WHITE_PIXEL = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...opts });
}

function piece(
  parent: THREE.Object3D,
  color: number,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(BOX, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeNameplate(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8,15,30,0.85)';
  ctx.strokeText(name, 160, 42);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 160, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2.8, 0.7, 1);
  sprite.position.y = 2.55;
  sprite.renderOrder = 10;
  return sprite;
}

function makeBar(color: number, width: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: WHITE_PIXEL, color, depthTest: false, transparent: true,
  }));
  sprite.center.set(0, 0.5);
  sprite.scale.set(width, 0.14, 1);
  sprite.renderOrder = 11;
  return sprite;
}

export class EntityVisual {
  readonly group = new THREE.Group();
  private torso: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftFoot: THREE.Mesh;
  private rightFoot: THREE.Mesh;
  private weapon: THREE.Group;
  private hpFill: THREE.Sprite;
  private hpBg: THREE.Sprite;
  private nameplate: THREE.Sprite;
  private muzzleFlash: THREE.Mesh;
  private head: THREE.Mesh;
  private archetype: ArchetypeId;
  private baseColor: number;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private walkPhase = 0;

  constructor(entity: Entity) {
    const arch = ARCHETYPES[entity.archetype];
    this.archetype = entity.archetype;
    this.baseColor = arch.color;
    const accent = arch.accent;

    // Torso + head.
    this.torso = piece(this.group, this.baseColor, 0.66, 0.82, 0.42, 0, 1.0, 0);
    this.head = piece(this.group, 0xf1c9a5, 0.46, 0.42, 0.42, 0, 1.62, 0);
    // Distinct silhouettes for the wider roster.
    if (entity.archetype === 'jackal') {
      piece(this.group, accent, 0.12, 0.5, 0.12, -0.18, 2.12, 0);
      piece(this.group, accent, 0.12, 0.5, 0.12, 0.18, 2.12, 0);
      piece(this.group, 0xfbbf24, 0.5, 0.1, 0.46, 0, 1.4, 0);
    } else if (entity.archetype === 'sovereign') {
      piece(this.group, accent, 0.54, 0.16, 0.5, 0, 1.94, 0);
      piece(this.group, accent, 0.1, 0.28, 0.1, -0.2, 2.1, 0);
      piece(this.group, accent, 0.1, 0.28, 0.1, 0, 2.14, 0);
      piece(this.group, accent, 0.1, 0.28, 0.1, 0.2, 2.1, 0);
    } else if (entity.archetype === 'commando') {
      piece(this.group, 0x1e293b, 0.52, 0.28, 0.5, 0, 1.82, 0);
      piece(this.group, accent, 0.4, 0.1, 0.06, 0, 1.72, 0.24);
    } else {
      piece(this.group, accent, 0.5, 0.16, 0.46, 0, 1.84, 0);
    }

    this.leftArm = piece(this.group, this.baseColor, 0.2, 0.62, 0.2, -0.46, 1.08, 0.05);
    this.rightArm = piece(this.group, this.baseColor, 0.2, 0.62, 0.2, 0.46, 1.08, 0.05);
    this.leftFoot = piece(this.group, 0x334155, 0.26, 0.22, 0.38, -0.2, 0.16, 0);
    this.rightFoot = piece(this.group, 0x334155, 0.26, 0.22, 0.38, 0.2, 0.16, 0);

    this.weapon = new THREE.Group();
    this.weapon.position.set(0.5, 1.05, 0.3);
    this.buildWeapon(entity.weapon, accent);
    this.group.add(this.weapon);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.muzzleFlash.position.set(1.4, 1.05, 0.3);
    this.muzzleFlash.visible = false;
    this.group.add(this.muzzleFlash);

    for (const child of this.group.children) {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        this.flashMats.push(child.material);
      }
    }

    const plate = makeNameplate(entity.name);
    this.nameplate = plate;
    this.group.add(plate);
    this.hpBg = makeBar(0x0f172a, 1.3);
    this.hpBg.position.set(-0.65, 2.25, 0);
    this.group.add(this.hpBg);
    this.hpFill = makeBar(0x22c55e, 1.3);
    this.hpFill.position.set(-0.65, 2.25, 0);
    this.group.add(this.hpFill);

    this.group.userData.entityId = entity.id;
  }

  private buildWeapon(kind: string, accent: number): void {
    switch (kind) {
      case 'bow': {
        const bow = piece(this.weapon, 0x8b5a2b, 0.1, 0.9, 0.1, 0, 0, 0);
        bow.rotation.z = 0.3;
        piece(this.weapon, 0xdedede, 0.03, 0.86, 0.03, 0.14, 0, 0);
        break;
      }
      case 'bolt':
        piece(this.weapon, 0x7c2d12, 0.12, 0.1, 0.8, 0, 0, 0.3);
        piece(this.weapon, 0x94a3b8, 0.16, 0.16, 0.2, 0, 0, 0.7);
        break;
      case 'shuriken': {
        const s = new THREE.Mesh(GOLD, mat(accent, { metalness: 0.7, roughness: 0.25 }));
        s.scale.set(0.5, 0.5, 0.12);
        s.position.set(0, 0, 0.3);
        this.weapon.add(s);
        break;
      }
      case 'scythe': {
        piece(this.weapon, 0x78350f, 0.09, 1.2, 0.09, 0, 0.2, 0);
        const blade = piece(this.weapon, 0xcbd5e1, 0.7, 0.1, 0.12, 0.36, 0.78, 0);
        blade.rotation.z = -0.4;
        break;
      }
      case 'laser':
        piece(this.weapon, 0x1e293b, 0.18, 0.2, 0.95, 0, 0, 0.4);
        piece(this.weapon, accent, 0.12, 0.12, 0.1, 0, 0, 0.9);
        break;
      case 'magic': {
        const wand = piece(this.weapon, 0x4c1d95, 0.09, 0.95, 0.09, 0, 0, 0.1);
        wand.rotation.z = 0.2;
        piece(this.weapon, 0x8b5cf6, 0.16, 0.16, 0.16, 0, 0.5, 0.35);
        break;
      }
      case 'sword':
        piece(this.weapon, 0x78350f, 0.09, 0.1, 0.4, 0, 0, 0);
        piece(this.weapon, 0xe2e8f0, 0.1, 0.09, 0.95, 0, 0, 0.65);
        piece(this.weapon, 0xf8fafc, 0.16, 0.09, 0.12, 0, 0, 0.2);
        break;
      case 'hammer':
        piece(this.weapon, 0x78350f, 0.08, 0.08, 0.85, 0, 0, 0.4);
        piece(this.weapon, 0x9ca3af, 0.42, 0.32, 0.4, 0, 0, 0.85);
        break;
      case 'spike':
        piece(this.weapon, 0x4c1d95, 0.16, 0.12, 0.16, 0, 0, 0.1);
        piece(this.weapon, 0x8b5cf6, 0.16, 0.35, 0.16, 0, 0.2, 0.1);
        break;
    }
  }

  /** Hide world-space labels when the rig is used as a menu preview. */
  showLabels(visible: boolean): void {
    this.nameplate.visible = visible;
    this.hpBg.visible = visible;
    this.hpFill.visible = visible;
  }

  update(entity: Entity, time: number, camera: THREE.Camera, dt = 1 / 60): void {
    this.group.position.set(entity.pos.x, 0, entity.pos.z);
    // The weapon is modelled along local +X; rotating by -facing points it
    // exactly where the simulation aims (including straight left).
    this.group.rotation.y = -entity.facing;
    this.group.scale.setScalar(sizeForLevel(entity.level));

    // Each archetype walks differently: ninja darts, reaper/knight plod.
    const walk = {
      archer: 1, shinobi: 1.9, reaper: 0.7, cyborg: 1.1, knight: 0.65,
      jackal: 0.75, sovereign: 0.9, commando: 1.2,
    }[this.archetype] ?? 1;
    const amp = {
      archer: 0.5, shinobi: 0.75, reaper: 0.35, cyborg: 0.42, knight: 0.3,
      jackal: 0.38, sovereign: 0.5, commando: 0.45,
    }[this.archetype] ?? 0.5;
    const bob = this.archetype === 'knight' ? 0.055 : 0.03;
    const speed = Math.hypot(entity.vel.x, entity.vel.z);
    this.walkPhase += (2 + speed * 1.6) * walk * dt;
    const swing = speed > 0.15 ? Math.sin(this.walkPhase) * amp : 0;
    this.leftFoot.rotation.x = swing;
    this.rightFoot.rotation.x = -swing;
    this.torso.position.y = 1.0 + Math.abs(Math.sin(this.walkPhase)) * bob;
    this.head.rotation.z = Math.sin(this.walkPhase) * 0.05;

    // Reset pose before applying this archetype's attack animation.
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.weapon.rotation.set(0, 0, 0);
    this.weapon.position.set(0.5, 1.05, 0.3);

    const kick = Math.max(0, Math.min(1, entity.fireCooldown * entity.stats.fireRate));
    this.torso.scale.set(0.66 + kick * 0.08, 0.82 - kick * 0.1, 0.42 + kick * 0.08);

    switch (this.archetype) {
      case 'archer':
        // Draw the bow back, then snap the string forward on release.
        this.leftArm.rotation.x = kick * 0.7;
        this.rightArm.rotation.x = -kick * 0.9;
        this.weapon.position.z = 0.3 - kick * 0.25;
        this.weapon.rotation.x = kick * 0.3;
        break;
      case 'shinobi':
        // Fast throwing motion with a spinning shuriken.
        this.rightArm.rotation.x = -kick * 1.5;
        this.rightArm.rotation.z = kick * 0.4;
        this.weapon.rotation.z = kick * Math.PI * 2;
        break;
      case 'reaper':
        // Wide sweeping scythe arc and heavy cloak sway.
        this.leftArm.rotation.x = -kick * 1.3;
        this.rightArm.rotation.x = -kick * 0.7;
        this.weapon.rotation.y = kick * Math.PI;
        this.weapon.rotation.z = time * 6;
        break;
      case 'cyborg':
        // Steady aimed rifle with sharp recoil.
        this.rightArm.rotation.x = -kick * 1.1;
        this.weapon.position.z = 0.3 - kick * 0.35;
        this.torso.rotation.x = -kick * 0.1;
        break;
      case 'knight':
      case 'jackal':
        // Heavy crossbow thrust with a forward lean.
        this.rightArm.rotation.x = -kick * 1.4;
        this.weapon.position.z = 0.3 - kick * 0.5;
        this.torso.rotation.x = kick * 0.18;
        break;
      case 'sovereign':
        this.leftArm.rotation.x = kick * 0.6;
        this.rightArm.rotation.x = -kick * 0.95;
        this.weapon.rotation.y = kick * 0.4;
        break;
      case 'commando':
        this.rightArm.rotation.x = -kick * 1.2;
        this.weapon.position.z = 0.3 - kick * 0.4;
        this.torso.rotation.x = -kick * 0.12;
        break;
    }

    const orbitStacks = entity.upgrades.weapon_orbit ?? 0;
    if (orbitStacks > 0) {
      const a = time * 3 + entity.id * 0.7;
      const r = 1.2 + (orbitStacks - 1) * 0.35;
      this.weapon.position.set(Math.cos(a) * r, 1.15, Math.sin(a) * r);
      this.weapon.rotation.set(0, -a, time * 5);
    }

    if (entity.weapon === 'sword' || entity.weapon === 'hammer') {
      // Wide swing arc for melee wielders.
      this.weapon.rotation.y = -kick * Math.PI * 0.9;
      this.rightArm.rotation.x = -kick * 1.6;
    }

    const flashMat = this.muzzleFlash.material as THREE.MeshBasicMaterial;
    flashMat.color.setHex(
      entity.weapon === 'magic' ? 0xc084fc : entity.weapon === 'laser' ? 0x67e8f9
        : entity.weapon === 'bolt' ? 0xfb7185 : 0xffe08a,
    );
    this.muzzleFlash.visible = kick > 0.72 && entity.alive;
    this.muzzleFlash.scale.setScalar(0.5 + kick * 0.9);
    flashMat.opacity = (kick - 0.72) * 3;

    // Hit flash.
    const flash = entity.hitFlash > 0 && Math.floor(time * 30) % 2 === 0;
    for (const m of this.flashMats) m.emissive.setHex(flash ? 0xff5555 : 0x000000);

    // Health bar.
    const frac = Math.max(0, Math.min(1, entity.hp / Math.max(1, entity.stats.maxHp)));
    this.hpFill.scale.x = 1.3 * frac;
    this.hpFill.material.color.setHex(frac > 0.5 ? 0x22c55e : frac > 0.25 ? 0xf59e0b : 0xef4444);
    // Billboard the bars to face the camera.
    this.hpBg.quaternion.copy(camera.quaternion);
    this.hpFill.quaternion.copy(camera.quaternion);

    this.group.visible = entity.alive;
  }

  dispose(): void {
    for (const m of this.flashMats) m.dispose();
  }
}
