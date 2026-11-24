/** GPU-instanced particle sparks, death bursts, and expanding bounce rings. */

import * as THREE from 'three';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  r: number; g: number; b: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

const SPARK_CAP = 900;
const RING_CAP = 24;

export class ParticleFX {
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private ringPool: Ring['mesh'][] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.TetrahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, SPARK_CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    const ringGeo = new THREE.RingGeometry(0.5, 0.62, 24);
    for (let i = 0; i < RING_CAP; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0x7dd3fc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.ringPool.push(m);
    }
  }

  burst(x: number, z: number, hex: number, count = 10, speed = 5, y = 0.7): void {
    this.color.setHex(hex);
    for (let i = 0; i < count && this.particles.length < SPARK_CAP; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = 0.3 + Math.random() * 0.45;
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s,
        life, maxLife: life,
        r: this.color.r, g: this.color.g, b: this.color.b,
        size: 0.12 + Math.random() * 0.16,
      });
    }
  }

  ring(x: number, z: number, hex = 0x7dd3fc): void {
    const mesh = this.ringPool.pop();
    if (!mesh) return;
    mesh.position.set(x, 0.08, z);
    mesh.scale.setScalar(0.3);
    mesh.material.color.setHex(hex);
    mesh.material.opacity = 0.85;
    mesh.visible = true;
    this.rings.push({ mesh, life: 0.45, maxLife: 0.45 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy -= 16 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    }

    const n = Math.min(this.particles.length, SPARK_CAP);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const t = p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 8, p.life * 6, 0);
      this.dummy.scale.setScalar(p.size * (0.4 + t * 0.6));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setRGB(p.r * t, p.g * t, p.b * t);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = Math.max(0, r.life / r.maxLife);
      r.mesh.scale.setScalar(0.3 + (1 - t) * 2.2);
      r.mesh.material.opacity = t * 0.85;
      if (r.life <= 0) {
        r.mesh.visible = false;
        this.ringPool.push(r.mesh);
        this.rings.splice(i, 1);
      }
    }
  }
}
