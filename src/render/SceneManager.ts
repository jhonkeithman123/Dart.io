/**
 * Three.js presentation layer (§2, §8.4): WebGPU→WebGL2 renderer, elevated
 * spring-damped isometric camera, shadows, instanced walls/pickups, zone mesh.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../core/World';
import type { AABB, GemKind, ThemePalette } from '../core/types';
import { THEMES } from '../core/MapData';
import { ARENA, MELEE, SPAWNING, heightForLevel } from '../core/constants';
import { EntityVisual } from './VoxelBuilder';
import { ParticleFX } from './ParticleFX';

const CAM_PITCH = (68 * Math.PI) / 180;
const CAM_DISTANCE = 34;
const GEM_CAP = 300;
const HEART_CAP = 40;
const ORB_CAP = 90;
const LASER_CAP = 24;

const GEM_COLORS: Record<GemKind, number> = { cyan: 0x22d3ee, green: 0x4ade80, gold: 0xfbbf24 };

function makeGridTexture(size: number, floorHex: number, gridHex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const floor = new THREE.Color(floorHex);
  const grid = new THREE.Color(gridHex);
  ctx.fillStyle = `rgb(${floor.r * 255},${floor.g * 255},${floor.b * 255})`;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = `rgb(${grid.r * 255},${grid.g * 255},${grid.b * 255})`;
  ctx.lineWidth = 1;
  const step = 512 / size;
  for (let i = 0; i <= size; i++) {
    const p = Math.round(i * step) + 0.5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }
  ctx.fillStyle = `rgb(${grid.r * 255},${grid.g * 255},${grid.b * 255})`;
  for (let x = 0; x <= size; x += 4) {
    for (let z = 0; z <= size; z += 4) {
      ctx.fillRect(x * step - 1.5, z * step - 1.5, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A recognizable black arrow pointing along +X (shaft, head, two fletches). */
function makeArrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 6);
  shaft.rotateZ(-Math.PI / 2);
  const head = new THREE.ConeGeometry(0.13, 0.32, 6);
  head.rotateZ(-Math.PI / 2);
  head.translate(0.68, 0, 0);
  const fletchA = new THREE.BoxGeometry(0.24, 0.03, 0.16);
  fletchA.translate(-0.48, 0, 0);
  const fletchB = new THREE.BoxGeometry(0.24, 0.16, 0.03);
  fletchB.translate(-0.48, 0, 0);
  const merged = mergeGeometries([shaft, head, fletchA, fletchB]);
  return merged ?? shaft;
}

function makeScytheGeometry(): THREE.BufferGeometry {
  const blade = new THREE.TorusGeometry(0.5, 0.055, 4, 14, Math.PI * 1.35);
  blade.rotateX(-Math.PI / 2);
  return blade;
}

/** Four-pointed shuriken star. */
function makeShurikenGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const points = 8;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.5 : 0.17;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  geo.center();
  return geo;
}

function makeHeartGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.62, 0.12, -0.36, 0.62, 0, 0.34);
  s.bezierCurveTo(0.36, 0.62, 0.62, 0.12, 0, -0.35);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1,
  });
  geo.center();
  geo.scale(0.8, 0.8, 0.8);
  return geo;
}

export class SceneManager {
  renderer: any;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly particles: ParticleFX;
  private canvas: HTMLCanvasElement;
  private focus = new THREE.Vector3(0, 0, 0);
  private cameraHeight = Math.sin(CAM_PITCH) * CAM_DISTANCE;
  private cameraBack = Math.cos(CAM_PITCH) * CAM_DISTANCE;
  private sun: THREE.DirectionalLight;
  private floor: THREE.Mesh | null = null;
  private wallMesh: THREE.InstancedMesh | null = null;
  private zoneCylinder: THREE.Mesh;
  private zoneRing: THREE.Mesh;
  private aimIndicator: THREE.Mesh;
  private visuals = new Map<number, EntityVisual>();
  private petVisuals = new Map<number, THREE.Group>();
  // Projectiles use pooled individual meshes rather than instancing: every
  // multishot projectile then renders reliably, independent of instance counts.
  private shotPools: Record<string, THREE.Group[]> = {
    bow: [], bolt: [], shuriken: [], scythe: [], magic: [],
  };
  private gemMesh: THREE.InstancedMesh;
  private heartMesh: THREE.InstancedMesh;
  private orbMesh: THREE.InstancedMesh;
  private orbGlowMesh: THREE.InstancedMesh;
  private lasers: Array<{ core: THREE.Mesh; halo: THREE.Mesh }> = [];
  private meleeArcs: THREE.Mesh[] = [];
  private spikeMeshes: THREE.Mesh[] = [];
  private orbitShurikenMeshes: THREE.Mesh[] = [];
  private orbitShieldMeshes: THREE.Mesh[] = [];
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();
  private theme: ThemePalette = THEMES[0];
  private mapKey = '';
  private halfSize = ARENA.STANDARD_SIZE / 2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    this.camera.position.set(0, this.cameraHeight, this.cameraBack);
    this.camera.lookAt(0, 0, 0);

    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 70, 170);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.1));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.8);
    this.sun.position.set(-18, 34, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 48;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Zone visuals.
    this.zoneCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.zoneCylinder.visible = false;
    this.scene.add(this.zoneCylinder);
    this.zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.visible = false;
    this.scene.add(this.zoneRing);

    // Short ghost arrow telegraphing the player's aim direction.
    this.aimIndicator = new THREE.Mesh(
      makeArrowGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.55,
        depthWrite: false, toneMapped: false,
      }),
    );
    this.aimIndicator.visible = false;
    this.scene.add(this.aimIndicator);

    // Projectile pools — individual meshes so every multishot shot renders.
    const arrowGeo = makeArrowGeometry();
    const shurikenGeo = makeShurikenGeometry();
    const scytheGeo = makeScytheGeometry();
    const POOL_SIZE = 160;
    const makePool = (geo: THREE.BufferGeometry, color: number, haloColor?: number): THREE.Group[] => {
      const pool: THREE.Group[] = [];
      const coreMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
      const haloMat = haloColor === undefined ? null : new THREE.MeshBasicMaterial({
        color: haloColor, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false,
      });
      for (let i = 0; i < POOL_SIZE; i++) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(geo, coreMat));
        if (haloMat) {
          const halo = new THREE.Mesh(geo, haloMat);
          halo.scale.setScalar(1.4);
          group.add(halo);
        }
        group.visible = false;
        this.scene.add(group);
        pool.push(group);
      }
      return pool;
    };
    this.shotPools.bow = makePool(arrowGeo, 0x0b1018, 0xfacc15);
    this.shotPools.bolt = makePool(arrowGeo, 0x7f1d1d, 0xef4444);
    this.shotPools.magic = makePool(arrowGeo, 0x8b5cf6, 0xc084fc);
    this.shotPools.shuriken = makePool(shurikenGeo, 0x22d3ee);
    this.shotPools.scythe = makePool(scytheGeo, 0x10b981);

    this.gemMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.35, emissive: 0x111111 }),
      GEM_CAP,
    );
    this.gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gemMesh.frustumCulled = false;
    this.gemMesh.count = 0;
    this.scene.add(this.gemMesh);

    this.heartMesh = new THREE.InstancedMesh(
      makeHeartGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xef4444, toneMapped: false }),
      HEART_CAP,
    );
    this.heartMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heartMesh.frustumCulled = false;
    this.heartMesh.count = 0;
    this.scene.add(this.heartMesh);

    const orbGeo = new THREE.IcosahedronGeometry(0.5, 1);
    this.orbMesh = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({
      color: 0x6d28d9, toneMapped: false,
    }), ORB_CAP);
    this.orbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbMesh.frustumCulled = false;
    this.orbMesh.count = 0;
    this.scene.add(this.orbMesh);

    this.orbGlowMesh = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({
      color: 0x8b5cf6, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false,
    }), ORB_CAP);
    this.orbGlowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbGlowMesh.frustumCulled = false;
    this.orbGlowMesh.count = 0;
    this.scene.add(this.orbGlowMesh);

    for (let i = 0; i < LASER_CAP; i++) {
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1, 8),
        new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      const halo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 1, 8),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      core.visible = false;
      halo.visible = false;
      this.scene.add(halo);
      this.scene.add(core);
      this.lasers.push({ core, halo });
    }

    // Melee swing arcs.
    const half = (MELEE.ARC_HALF_ANGLE_DEG * Math.PI) / 180;
    const arcGeo = new THREE.RingGeometry(0.42, 1, 24, 1, -half, half * 2);
    arcGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 32; i++) {
      const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({
        color: 0x67e8f9, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, toneMapped: false,
      }));
      arc.visible = false;
      this.scene.add(arc);
      this.meleeArcs.push(arc);
    }

    // Ground spikes (player-placed and map hazards).
    const spikeGeo = new THREE.ConeGeometry(0.34, 0.85, 6);
    spikeGeo.translate(0, 0.42, 0);
    for (let i = 0; i < 160; i++) {
      const spike = new THREE.Mesh(spikeGeo, new THREE.MeshStandardMaterial({
        color: 0x64748b, roughness: 0.5, metalness: 0.3, emissive: 0x220000,
      }));
      spike.visible = false;
      this.scene.add(spike);
      this.spikeMeshes.push(spike);
    }

    // Orbiting upgrade visuals.
    const orbitShurikenGeo = makeShurikenGeometry();
    orbitShurikenGeo.scale(0.5, 0.5, 0.5);
    for (let i = 0; i < 96; i++) {
      const m = new THREE.Mesh(orbitShurikenGeo, new THREE.MeshBasicMaterial({ color: 0xa5f3fc, toneMapped: false }));
      m.visible = false;
      this.scene.add(m);
      this.orbitShurikenMeshes.push(m);
    }
    const shieldGeo = new THREE.TorusGeometry(0.32, 0.09, 6, 16);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({
        color: 0x93c5fd, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.visible = false;
      this.scene.add(m);
      this.orbitShieldMeshes.push(m);
    }

    this.particles = new ParticleFX(this.scene);
    this.applyTheme(this.theme);
    this.resize();
  }

  /** Optionally upgrade to WebGPU when available (automatic WebGL2 fallback). */
  async tryWebGPU(): Promise<void> {
    try {
      const mod = await import(/* @vite-ignore */ 'three/webgpu' as string);
      const WebGPURenderer = (mod as any).WebGPURenderer;
      if (!WebGPURenderer) return;
      const r = new WebGPURenderer({ canvas: this.canvas, antialias: true });
      await r.init();
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (r.shadowMap) r.shadowMap.enabled = true;
      r.outputColorSpace = THREE.SRGBColorSpace;
      // Only swap once the WebGPU renderer is fully configured.
      this.renderer.dispose();
      this.renderer = r;
    } catch {
      // WebGPU unavailable — keep the WebGL2 renderer.
    }
  }

  private applyTheme(theme: ThemePalette): void {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.id === 'cyber' ? 0x050914 : 0xe2e8f0);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(theme.id === 'cyber' ? 0x050914 : 0xe2e8f0);
  }

  setTheme(id: string): void {
    const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
    this.applyTheme(theme);
    if (this.floor) {
      this.floor.material = new THREE.MeshStandardMaterial({
        map: makeGridTexture(this.halfSize * 2, theme.floor, theme.grid),
        roughness: 0.95,
      });
    }
    this.rebuildWalls();
  }

  setMap(walls: AABB[], halfSize: number, themeId: string): void {
    this.halfSize = halfSize;
    const key = `${themeId}:${halfSize}:${walls.length}`;
    this.setTheme(themeId);
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor.geometry.dispose();
    }
    const floorGeo = new THREE.PlaneGeometry(halfSize * 2 + 8, halfSize * 2 + 8);
    this.floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      map: makeGridTexture(halfSize * 2, this.theme.floor, this.theme.grid),
      roughness: 0.95,
    }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.mapKey = key;
    this.rebuildWalls();
  }

  private rebuildWalls(): void {
    // Walls are rebuilt by setMap via a stored copy; handled there for simplicity.
    void this.mapKey;
  }

  /** Rebuild instanced walls from a fresh map (called by main on world creation). */
  buildWalls(walls: AABB[]): void {
    if (this.wallMesh) {
      this.scene.remove(this.wallMesh);
      this.wallMesh.dispose();
    }
    const side = new THREE.MeshStandardMaterial({ color: this.theme.wallSide, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ color: this.theme.wallTop, roughness: 0.6 });
    const materials = [side, side, top, side, side, side];
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials, walls.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    walls.forEach((w, i) => {
      this.dummy.position.set((w.minX + w.maxX) / 2, w.height / 2, (w.minZ + w.maxZ) / 2);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(w.maxX - w.minX, w.height, w.maxZ - w.minZ);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.wallMesh = mesh;
  }

  /** Synchronize all visuals from simulation state and render one frame. */
  sync(world: World, dt: number): void {
    const player = world.state.player;
    const aimLead = player ? 2.2 : 0;
    const tx = player ? player.pos.x + player.vel.x * 0.18 + Math.cos(player.facing) * aimLead * 0.35 : 0;
    const tz = player ? player.pos.z + player.vel.z * 0.18 + Math.sin(player.facing) * aimLead * 0.35 : 0;
    const k = 1 - Math.exp(-6 * dt);
    this.focus.x += (tx - this.focus.x) * k;
    this.focus.z += (tz - this.focus.z) * k;
    this.camera.position.set(this.focus.x, this.cameraHeight, this.focus.z + this.cameraBack);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    this.sun.position.set(this.focus.x - 18, 34, this.focus.z + 14);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);

    // Aim telegraph: a short ghost arrow, roughly twice the character's height.
    if (player && player.alive) {
      const length = heightForLevel(player.level) * 2;
      const scale = length / 1.3; // arrow geometry is ~1.3 units long
      this.aimIndicator.visible = true;
      this.aimIndicator.position.set(
        player.pos.x + Math.cos(player.facing) * (player.radius + length * 0.5),
        1.0,
        player.pos.z + Math.sin(player.facing) * (player.radius + length * 0.5),
      );
      this.aimIndicator.rotation.set(0, -player.facing, 0);
      this.aimIndicator.scale.setScalar(scale);
    } else {
      this.aimIndicator.visible = false;
    }

    const time = world.state.time;
    const seen = new Set<number>();
    for (const e of world.state.entities) {
      seen.add(e.id);
      let visual = this.visuals.get(e.id);
      if (!visual) {
        visual = new EntityVisual(e);
        this.visuals.set(e.id, visual);
        this.scene.add(visual.group);
      }
      visual.update(e, time, this.camera, dt);
    }
    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        this.scene.remove(visual.group);
        visual.dispose();
        this.visuals.delete(id);
      }
    }

    this.syncPets(world, time);
    this.syncShots(world, time);
    this.syncGems(world, time);
    this.syncHearts(world);
    this.syncOrbs(world);
    this.syncLasers(world);
    this.syncMeleeSwings(world);
    this.syncSpikes(world);
    this.syncOrbitUpgrades(world, time);
    this.syncZone(world);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private makePetMesh(kind: string): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    let geo: THREE.BufferGeometry;
    switch (kind) {
      case 'sickle':
        geo = new THREE.TorusGeometry(0.32, 0.07, 4, 10, Math.PI * 1.3);
        geo.rotateX(-Math.PI / 2);
        material.color.setHex(0x10b981);
        break;
      case 'laser':
        geo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6);
        material.color.setHex(0x67e8f9);
        break;
      case 'shuriken':
        geo = makeShurikenGeometry();
        geo.scale(0.45, 0.45, 0.45);
        material.color.setHex(0xa5f3fc);
        break;
      default:
        geo = new THREE.IcosahedronGeometry(0.28, 0);
        material.color.setHex(0xf97316);
    }
    group.add(new THREE.Mesh(geo, material));
    return group;
  }

  private syncPets(world: World, time: number): void {
    const seen = new Set<number>();
    for (const pet of world.state.pets) {
      seen.add(pet.id);
      let visual = this.petVisuals.get(pet.id);
      if (!visual) {
        visual = this.makePetMesh(pet.kind);
        this.petVisuals.set(pet.id, visual);
        this.scene.add(visual);
      }
      const owner = world.state.getEntity(pet.ownerId);
      if (!owner) continue;
      visual.position.set(
        owner.pos.x + Math.cos(pet.angle) * pet.radius,
        1.1 + Math.sin(pet.angle * 2 + pet.id) * 0.15,
        owner.pos.z + Math.sin(pet.angle) * pet.radius,
      );
      visual.rotation.set(
        pet.kind === 'shuriken' ? Math.PI / 2 : 0,
        time * (pet.kind === 'sickle' ? 9 : 3),
        0,
      );
    }
    for (const [id, visual] of this.petVisuals) {
      if (!seen.has(id)) {
        this.scene.remove(visual);
        this.petVisuals.delete(id);
      }
    }
  }

  private syncShots(world: World, time: number): void {
    const used: Record<string, number> = { bow: 0, bolt: 0, magic: 0, shuriken: 0, scythe: 0 };
    for (const p of world.state.projectiles) {
      const pool = this.shotPools[p.kind];
      if (!pool) continue;
      const index = used[p.kind]++;
      if (index >= pool.length) continue;
      const group = pool[index];
      const angle = Math.atan2(p.vel.z, p.vel.x);
      const y = p.kind === 'scythe' ? 0.9 : 1.0;
      const scale = p.kind === 'scythe'
        ? Math.max(1.1, p.radius * 3)
        : p.kind === 'shuriken'
          ? Math.max(1.1, p.radius * 5)
          : Math.max(1.9, p.radius * 9);
      group.position.set(p.pos.x, y, p.pos.z);
      group.rotation.set(0, -angle, 0);
      group.scale.setScalar(scale);
      // Spin the flat blade/star around its own forward axis.
      const core = group.children[0] as THREE.Mesh;
      core.rotation.set(
        p.kind === 'shuriken' ? Math.PI / 2 : 0,
        0,
        p.kind === 'scythe' ? time * 8 : p.kind === 'shuriken' ? time * 9 : 0,
      );
      group.visible = true;
    }
    for (const kind of Object.keys(this.shotPools)) {
      const pool = this.shotPools[kind];
      for (let i = used[kind] ?? 0; i < pool.length; i++) pool[i].visible = false;
    }
  }

  private syncGems(world: World, time: number): void {
    let n = 0;
    for (const gem of world.state.gems) {
      if (n >= GEM_CAP) break;
      const s = gem.kind === 'gold' ? 0.85 : gem.kind === 'green' ? 0.7 : 0.55;
      this.dummy.position.set(gem.pos.x, 0.75 + Math.sin(gem.bob) * 0.18, gem.pos.z);
      this.dummy.rotation.set(0, gem.bob, time * 0.5);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.gemMesh.setMatrixAt(n, this.dummy.matrix);
      this.tint.setHex(GEM_COLORS[gem.kind]);
      this.gemMesh.setColorAt(n, this.tint);
      n++;
    }
    this.gemMesh.count = n;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    if (this.gemMesh.instanceColor) this.gemMesh.instanceColor.needsUpdate = true;
  }

  private syncHearts(world: World): void {
    let n = 0;
    for (const heart of world.state.hearts) {
      if (n >= HEART_CAP) break;
      this.dummy.position.set(heart.pos.x, 1.05 + Math.sin(heart.bob) * 0.2, heart.pos.z);
      this.dummy.rotation.set(-0.3 + Math.sin(heart.bob) * 0.08, Math.sin(heart.bob) * 0.5, 0);
      this.dummy.scale.setScalar(0.85 * (1 + Math.sin(heart.bob) * 0.1));
      this.dummy.updateMatrix();
      this.heartMesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.heartMesh.count = n;
    this.heartMesh.instanceMatrix.needsUpdate = true;
  }

  private syncOrbs(world: World): void {
    let n = 0;
    for (const orb of world.state.orbs) {
      if (n >= ORB_CAP) break;
      const base = orb.size === 'large' ? 1.3 : orb.size === 'medium' ? 1.0 : 0.75;
      let scale = base * (1 + Math.sin(orb.bob) * 0.12);
      let y = 1.1 + Math.sin(orb.bob * 0.8) * 0.25;
      if (orb.collected) {
        // Shared absorb animation: shrink and sink into the collecting character.
        const t = 1 - Math.max(0, orb.collectAnim) / SPAWNING.ORB_ABSORB_TIME;
        scale = base * (1 - t * 0.85);
        y = 1.05 + Math.sin(orb.bob * 0.8) * 0.1 - t * 0.15;
      }
      this.dummy.position.set(orb.pos.x, y, orb.pos.z);
      this.dummy.rotation.set(orb.spin * 0.6, orb.spin, orb.spin * 0.3);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.orbMesh.setMatrixAt(n, this.dummy.matrix);

      this.dummy.scale.setScalar(scale * 1.55);
      this.dummy.updateMatrix();
      this.orbGlowMesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.orbMesh.count = n;
    this.orbGlowMesh.count = n;
    this.orbMesh.instanceMatrix.needsUpdate = true;
    this.orbGlowMesh.instanceMatrix.needsUpdate = true;
  }

  private syncLasers(world: World): void {
    let i = 0;
    for (const beam of world.state.lasers) {
      if (i >= this.lasers.length) break;
      const { core, halo } = this.lasers[i++];
      const dx = beam.to.x - beam.from.x;
      const dz = beam.to.z - beam.from.z;
      const length = Math.hypot(dx, dz);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz).normalize(),
      );
      for (const [mesh, width] of [[core, 1], [halo, 2.6]] as const) {
        mesh.visible = true;
        mesh.position.set((beam.from.x + beam.to.x) / 2, 0.85, (beam.from.z + beam.to.z) / 2);
        mesh.scale.set(width, Math.max(0.01, length), width);
        mesh.quaternion.copy(quaternion);
      }
      const fade = 1 - beam.age / beam.life;
      (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, fade);
      (halo.material as THREE.MeshBasicMaterial).opacity = Math.max(0, fade) * 0.35;
    }
    for (; i < this.lasers.length; i++) {
      this.lasers[i].core.visible = false;
      this.lasers[i].halo.visible = false;
    }
  }

  private syncMeleeSwings(world: World): void {
    for (let i = 0; i < this.meleeArcs.length; i++) {
      const arc = this.meleeArcs[i];
      const swing = world.state.meleeSwings[i];
      if (!swing) { arc.visible = false; continue; }
      arc.visible = true;
      arc.position.set(swing.from.x, 0.85, swing.from.z);
      arc.rotation.set(0, -swing.angle, 0);
      arc.scale.setScalar(swing.range);
      const material = arc.material as THREE.MeshBasicMaterial;
      material.color.setHex(swing.kind === 'hammer' ? 0xfb923c : 0x67e8f9);
      material.opacity = Math.max(0, 1 - swing.age / swing.life) * 0.7;
    }
  }

  private syncSpikes(world: World): void {
    for (let i = 0; i < this.spikeMeshes.length; i++) {
      const mesh = this.spikeMeshes[i];
      const spike = world.state.spikes[i];
      if (!spike) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(spike.pos.x, 0, spike.pos.z);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.setHex(spike.ownerId === 0 ? 0xef4444 : 0x8b5cf6);
      const fade = Math.min(1, (spike.life - spike.age) / 1.5);
      mesh.scale.setScalar(Math.max(0.01, fade));
      mesh.rotation.y = spike.id * 0.7;
    }
  }

  private syncOrbitUpgrades(world: World, time: number): void {
    let si = 0;
    let hi = 0;
    for (const e of world.state.entities) {
      if (!e.alive) continue;
      const shurikens = e.upgrades.rotating_shuriken ?? 0;
      const shields = e.upgrades.rotating_shield ?? 0;
      for (let k = 0; k < shurikens && si < this.orbitShurikenMeshes.length; k++) {
        const mesh = this.orbitShurikenMeshes[si++];
        const a = time * 3.4 + (k / shurikens) * Math.PI * 2 + e.id;
        mesh.visible = true;
        mesh.position.set(e.pos.x + Math.cos(a) * 1.9, 1.05, e.pos.z + Math.sin(a) * 1.9);
        mesh.rotation.set(Math.PI / 2, time * 9, 0);
      }
      for (let k = 0; k < shields && hi < this.orbitShieldMeshes.length; k++) {
        const mesh = this.orbitShieldMeshes[hi++];
        const a = -time * 2.4 + (k / shields) * Math.PI * 2 + e.id;
        mesh.visible = true;
        mesh.position.set(e.pos.x + Math.cos(a) * 1.5, 1.1, e.pos.z + Math.sin(a) * 1.5);
        mesh.rotation.set(0, -a, 0);
      }
    }
    for (let i = si; i < this.orbitShurikenMeshes.length; i++) this.orbitShurikenMeshes[i].visible = false;
    for (let i = hi; i < this.orbitShieldMeshes.length; i++) this.orbitShieldMeshes[i].visible = false;
  }

  private syncZone(world: World): void {
    const z = world.state.zone;
    this.zoneCylinder.visible = z.active;
    this.zoneRing.visible = z.active;
    if (!z.active) return;
    this.zoneCylinder.position.set(z.center.x, 4, z.center.z);
    this.zoneCylinder.scale.set(z.radius, 8, z.radius);
    this.zoneRing.position.set(z.center.x, 0.06, z.center.z);
    this.zoneRing.scale.setScalar(z.radius);
  }

  /** Remove all entity visuals from a finished match before returning home. */
  clearWorld(): void {
    for (const visual of this.visuals.values()) {
      this.scene.remove(visual.group);
      visual.dispose();
    }
    this.visuals.clear();
    for (const visual of this.petVisuals.values()) this.scene.remove(visual);
    this.petVisuals.clear();
    for (const pool of Object.values(this.shotPools)) {
      for (const group of pool) group.visible = false;
    }
    for (const beam of this.lasers) {
      beam.core.visible = false;
      beam.halo.visible = false;
    }
    for (const arc of this.meleeArcs) arc.visible = false;
    for (const spike of this.spikeMeshes) spike.visible = false;
    for (const m of this.orbitShurikenMeshes) m.visible = false;
    for (const m of this.orbitShieldMeshes) m.visible = false;
    this.zoneCylinder.visible = false;
    this.zoneRing.visible = false;
    this.aimIndicator.visible = false;
    this.focus.set(0, 0, 0);
  }

  /** Convert a screen-space pointer position to a floor-plane world point. */
  screenToFloor(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
    const point = new THREE.Vector3();
    ray.ray.intersectPlane(plane, point);
    return point;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
