# 🎯 Dart.io

> A fast-paced, open-source 3D voxel arena shooter inspired by classic top-down dual-stick archery games—built for mobile and desktop browsers with Three.js and TypeScript.

![Dart.io Banner](./assets/banner.gif)

## ✨ Overview

**Dart.io** brings back the fast, lightweight, chaotic bullet-hell fun of classic arena archery shooters directly in the browser—no bloated menus, no paywalls, and full offline playability against intelligent AI bots.

Built from the ground up with a **strictly decoupled simulation core**, Dart.io runs smoothly at 60 FPS on Android/iOS mobile browsers and desktop PCs while remaining ready to plug into an authoritative multiplayer backend.

---

## 🎮 Features

- **3D Voxel Aesthetic:** Procedural 3D voxel characters, weapons, glowing XP gems, and dynamic shadows rendered via Three.js (`WebGPURenderer` with automatic WebGL2 fallback).
- **Three Distinct Game Modes:**
  - **Endless Arena:** Classic survival high-score chase with continuous bot respawns.
  - **Battle Royale (Shrinking Zone):** 24-combatant single-life elimination inside a shrinking danger barrier.
  - **3-Minute Blitz:** High-speed timed match with boosted XP rates where highest score wins.
- **Roguelite Level-Up Draft:** Collect XP crystals mid-match and choose from 3 random upgrades every level—stacking _Front/Diagonal/Rear/Side Arrows, Wall Bounce, Piercing, Giant Arrows, Scythes, Shurikens,_ and _Laser Beams_.
- **3-Tier Tactical AI Bots:**
  - **Easy:** Casual aim and movement for learning builds.
  - **Normal:** Velocity-predicted shots and active XP foraging.
  - **Hard (Pro):** Quadratic ballistic intercept aiming, wall-bounce bank shots, and perpendicular projectile dodging.
- **Adaptive Controls:** Dual on-screen joysticks on both desktop and touch devices — left walks, right aims and fires on release. `WASD` and arrow keys are keyboard alternatives.

---

## 🕹️ Playable Character Archetypes

| Archetype          | Starting Weapon  | Signature Perk                                 |
| :----------------- | :--------------- | :--------------------------------------------- |
| **Archer**         | Classic Bow      | Balanced speed, range, and fire rate           |
| **Shinobi**        | Shurikens        | High projectile velocity + faster movement     |
| **Reaper**         | Spinning Scythes | Wide-hitbox heavy projectiles with high damage |
| **Cyborg**         | Energy Rifle     | Instant hitscan laser beams                    |
| **Crimson Knight** | Heavy Crossbow   | **+15% Lifesteal** on enemy eliminations       |

---

## 🏗️ Project Architecture

The codebase separates pure deterministic game rules from 3D rendering so the simulation can later run identically on an authoritative multiplayer server:

```text
dart-io/
├── assets/                 # Logos, banners, and promotional media
├── docs/                   # Game Design Document & technical specs
│   └── GDD_AND_ARCHITECTURE.md
├── src/
│   ├── core/               # Pure TypeScript simulation (zero Three.js/DOM imports)
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── SpatialGrid.ts
│   │   ├── PhysicsEngine.ts
│   │   ├── UpgradePool.ts
│   │   ├── GameModes.ts
│   │   └── WorldState.ts
│   ├── ai/                 # Ballistic intercept solver & context-steering bot brains
│   │   ├── AimSolver.ts
│   │   └── BotBrain.ts
│   ├── render/             # Three.js scene, procedural voxel builder & particles
│   │   ├── SceneManager.ts
│   │   ├── VoxelBuilder.ts
│   │   └── ParticleSystem.ts
│   ├── input/              # Unified Desktop & Mobile dual-stick input
│   │   └── InputManager.ts
│   ├── audio/              # Procedural Web Audio synthesizer (zero external MP3s)
│   │   └── SoundFX.ts
│   └── main.ts             # Fixed-timestep 60Hz game loop & HUD bindings
├── AGENTS.md               # AI coding agent instructions (Graphify workflow)
├── task.md                 # Implementation task tracker & progress log
└── README.md
```

---

## 🚀 Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build    # typecheck + Vite bundle → dist/
npm run preview
```

Headless simulation smoke test (all three modes, 2400 ticks each):

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=smoke.mjs
node smoke.mjs
```

## 🕹️ Controls

| Device | Move | Aim | Fire |
| :--- | :--- | :--- | :--- |
| **Desktop** | `WASD` or left on-screen joystick | Right joystick direction (arrow keys also work) | Drag the right joystick then release |
| **Touch** | Left floating joystick | Right floating joystick | Drag the right joystick to aim, then release |

Both joysticks are visible and usable on PC and mobile. Clicking and `Space` no longer fire — a bare tap does nothing. A short cyan ghost arrow shows your aim direction. Every owned weapon fires with that shot.

## ✅ Implementation Status

Offline phase (Milestones 1–5) is complete: decoupled 60Hz simulation core, physics with
spatial hashing and wall-bounce reflection, 5 voxel archetypes, 3 game modes (including the
shrinking Battle Royale barrier), 20+ upgrades with a 3-card draft, 3-tier tactical AI,
procedural Web Audio, and desktop/touch controls. The transport adapter is in place;
authoritative multiplayer (Milestone 6) is scaffolded in `src/network/SocketAdapter.ts`.

See [`task.md`](./task.md) for the full task breakdown and progress log.

## 📐 Current Game Rules (tuning pass)
- **Arenas:** 96×96 units (Endless/Blitz), 120×120 units (Battle Royale). Characters never spawn within 7 units of another.
- **Units:** 1 world unit = 1 meter = 39.37 inches. Imperial is the default; toggle to metric in the HUD.
- **Progression:** Levels 0–20. 0→1 needs 10 XP, then each level adds 200 (1→2 = 200, 2→3 = 400 … 19→20 = 3800). Characters grow in size (and walk slower) as they level.
- **XP sources:** Gems (1/5/15), animated floating orbs (10/25/50), and eliminations (50 + 50 × victim level, capped at 1000). Collected orbs fly into the character that picked them up in a shared absorb animation.
- **Health:** Characters have segmented health bars instead of a meter — 3 bars at level 0, +2 per level through 10, then +1 per level to 20 (23 at level 10, 33 at level 20). Level-ups heal the newly added bars. Heart-shaped health pickups are rarer than EXP orbs (5 vs 40, respawning every 6.5s vs 2.5s) and restore 2 bars. Max HP and Move Speed upgrade cards were removed.
- **Damage:** Every weapon deals just 1–2 base damage; all scaling comes from upgrades. Hazards, orbiting shurikens/shields, and spikes use the same small scale.
- **Combat:** One shot per press with no cooldown for the player; bots keep their own cadence. Base movement is a fixed 3.6 m/s for everyone.
- **Population:** When the arena gets sparse, new bots spawn at or below the player's level (never above level 20).
- **Arsenal:** Upgrade cards no longer replace your weapon — they add it. Every owned weapon fires on each attack, so picking up new weapons directly increases your strength. Seven ranged weapons (bow, shuriken, scythe, laser, bolt, magic arrow) plus two melee weapons (sword, hammer) are draftable.
- **Melee:** Sword and hammer hit every enemy in a close-range forward arc with a visible swing, instead of firing projectiles.
- **Spikes:** The spike weapon places ground spikes that damage everyone except the character that placed them. Map-owned spikes hurt everyone. Metal Shoes grants full spike immunity.
- **Orbiting weapons:** The Orbiting Weapon upgrade circles your held weapon around you; **Rotating Shuriken** adds up to 6 orbiting shurikens that slice nearby enemies; **Rotating Shield** adds up to 4 orbiting shields that reduce incoming damage by 12% per shield and strike nearby enemies.
- **Walls:** Characters phase through interior walls automatically and can never get stuck in cover; projectiles still collide and bounce.
- **Weapon tuning & effects:** Additional cards boost damage/size/range/velocity for every weapon, and effects add explosive impacts, chain lightning and vampiric healing.
- **Draft rarity:** Three tiers — **common** (everything else, all equal odds), **rare** (character stats), and **super rare** (weapon effects plus the tracking **Magic Arrow**). Offers use weighted sampling without replacement, so super-rare picks are genuinely uncommon.
- **Projectiles:** Each weapon has its own color and model — black arrow/yellow halo (bow), dark-red arrow/red halo (bolt), cyan shuriken, emerald scythe arc, purple magic arrow, cyan laser. Simultaneous shots fan out from separate muzzle offsets, and multishot upgrades (front/rear/diagonal/side) spawn each arrow just outside the character in its own travel direction so none disappear at release. Characters have archetype-specific walk and attack animations with matching muzzle flashes.
- **Character abilities/perks:** Eight original archetypes with distinct voxel silhouettes and attack styles. Abilities/passives are shown in the character-select preview.
- **Sidekick pets:** Super-rare drafts add orbiting companions (Sickle Familiar, Laser Wisp, Shuriken Sprite, Bomb Orbit) that auto-fire at nearby enemies.
- **Kill callouts:** Kill streaks appear in the feed — First Blood!, Double Kill!!, Killing Spree!!!, Rampage!!!

## 🕹️ Nostalgia note
The original *Arrow.io* APK was studied only as a **mechanical reference** to restore the arcade feel (pets, conversions, multishot, fast level-ups). Dart.io uses none of its textures, sounds, code, character names or trademarks — every asset here is original and procedurally generated.
