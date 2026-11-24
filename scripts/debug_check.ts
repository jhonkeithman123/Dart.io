import { World } from '../src/core/World';
import { weaponProfile } from '../src/core/UpgradePool';
import type { ArchetypeId } from '../src/core/types';

for (const arch of ['archer', 'sovereign', 'shinobi'] as ArchetypeId[]) {
  const w = new World({ mode: 'endless', archetype: arch, difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  console.log(arch, 'stats.homing=', p.stats.homing, 'profile.homing=', weaponProfile(p, p.weapon).homing);
  w.state.projectiles.length = 0;
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const shot = w.state.projectiles[0];
  if (!shot) { console.log(' no shot'); continue; }
  const before = { ...shot.vel };
  const enemy = w.state.entities.find((e) => e.isBot)!;
  enemy.pos = { x: p.pos.x - 3, z: p.pos.z }; // enemy to the LEFT
  for (let i = 0; i < 6; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  const after = w.state.projectiles.find((s) => s.id === shot.id)?.vel ?? shot.vel;
  const turned = Math.abs(Math.atan2(after.z, after.x) - Math.atan2(before.z, before.x));
  console.log(' projectile homing=', shot.homing, 'turned(rad)=', turned.toFixed(3));
}
