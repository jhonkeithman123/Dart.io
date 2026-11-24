# Project Dart.io — Game Design & Technical Architecture

> **Vision:** A fast-paced, open-source 3D browser arena shooter inspired by classic v1.x *Arrow.io*, engineered with a strictly decoupled simulation architecture so it runs seamlessly offline with smart AI bots today and plugs cleanly into a high-performance authoritative multiplayer server tomorrow.

## 1. Intellectual Property & Open-Source Compliance

* **Original Assets & Branding:** All 3D voxel geometry, UI layouts, procedural Web Audio sound effects, and branding are built 100% from scratch.
* **No Trademark Infringement:** Avoid using the name *"Arrow.io"* or Cheetah Games' proprietary art/audio files. Official project name: **Dart.io** (with animated voxel logo banner).
* **License:** MIT or GPL-3.0 for open-source community contributions.

## 2. Visual Theme & 3D Presentation (Three.js)

* **Rendering Engine:** Three.js (`WebGPURenderer` with automatic `WebGL2` fallback) utilizing `InstancedMesh` for walls, projectiles, XP gems, and particle bursts to maintain a locked **60 FPS** on mobile Android browsers.
* **Camera Perspective:** Elevated 3D isometric / high-angle camera (~62° pitch) with smooth spring-damping and slight directional lead toward the player's aim vector.
* **Arena Environment:**
  * High-contrast light-gray grid floor (`64 × 64` world units; `80 × 80` for Battle Royale) with crisp tile lines for effortless spatial tracking.
  * Low-profile 3D maze blocks (soft slate-blue / pastel gray) casting soft directional shadows.
  * Floating, rotating 3D octahedron **XP Gems** (Cyan = 1 XP, Green = 5 XP, Gold = 15 XP) and spinning glossy red 3D **Health Hearts**.
* **Procedural Web Audio (Zero External Assets):**
  * Synthesized bow twangs, laser zaps, wall-bounce pings, escalating-pitch XP pickup chimes, and level-up fanfares using the browser's native Web Audio API.

## 3. Playable Characters (All Unlocked in Offline Phase)

Built via a procedural 3D voxel character rig (head, torso, articulated arms holding weapon, waddling feet, and squash-and-stretch firing animation) with diegetic 3D world-space nameplates and health bars:

| Archetype | Visual Design | Starting Weapon | Passive Trait |
| :--- | :--- | :--- | :--- |
| **1. Classic Archer** | Blue tunic, wooden recurve bow | Standard Wooden Arrows | Balanced movement & fire rate (+10% XP gain) |
| **2. Shinobi** | Dark ninja hood & crimson scarf | Throwing Shurikens | +15% Movement Speed, faster projectile velocity |
| **3. Reaper** | Hooded dark cloak, glowing eyes | Spinning Scythes | +25% Projectile Size & Knockback |
| **4. Cyborg** | Chrome visor helmet, energy core | Instant Thin Laser Beam | Hitscan beam pierces 1 target by default |
| **5. Crimson Knight** | Red plate voxel armor & plume | Heavy Broadhead Bolts | +15% Max HP & heals 12% HP on enemy elimination |

## 4. Game Modes

All modes share the same core combat loop, upgrade draft pool, and arena geometry, governed by a `GameModeController` state machine:

### A. Endless Arena (Classic Survival)
* **Rules:** No time limit. Survive as long as possible, climb the live in-match leaderboard, and chase high scores/kill streaks.
* **Population:** 16 active combatants. Defeated bots respawn after 3 seconds at safe spawn zones scaled near the average arena level.

### B. Battle Royale (Shrinking Zone)
* **Rules:** 24 combatants, **1 life (no respawns)**. Last player standing wins.
* **Shrinking Zone Mechanic:** A translucent red 3D cylindrical **Danger Barrier** contracts toward a randomized safe point every 45 seconds. Standing outside deals escalating percentage-based damage per second. High-value Gold XP clusters spawn near the safe center to force engagements.

### C. Timed 3-Minute Blitz
* **Rules:** 180-second match timer. Instant respawns (retaining 50% of earned upgrades on death).
* **Win Condition:** Highest total **Score (`Kills × 100 + Total XP`)** when the timer hits `00:00`. Features 2× XP gem spawn rates for rapid late-game chaos.

## 5. Upgrade Draft System (Level-Up Cards)

Filling the XP bar triggers a slow-motion / paused **3-Card Upgrade Draft** drawn from four synergistic categories:

1. **Multishot & Angles (Stackable):**
   * *Front Arrow (+1)*, *Diagonal Arrows (+2)*, *Rear Arrow (+1)*, *Side Arrows (+2)*, *360° Nova Burst*.
2. **Projectile Physics:**
   * *Wall Bounce (+1 bounce)*, *Piercing Shot*, *Homing Arrows*, *Giant Arrows (+35% size & damage)*.
3. **Weapon Mutations:**
   * *Scythe Conversion*, *Shuriken Conversion*, *Laser Beam Conversion*, *Fire Tip (Burn DoT)*, *Frost Tip (30% Slow)*.
4. **Character Stats:**
   * *Attack Speed Up (+20%)*, *Move Speed Up (+15%)*, *Max HP + Instant Heal (+25%)*, *Magnet Range (+50%)*, *Critical Strike (+15% chance for 2× damage)*.

## 6. Adaptive Controls (Mobile & Desktop)

* **Android / Touch Devices:**
  * **Left Half of Screen:** Floating virtual thumbstick for 360° movement.
  * **Right Half of Screen:** Floating virtual thumbstick for 360° aiming & firing (auto-fires while dragged; quick-tap fires toward nearest enemy).
* **Desktop (PC):**
  * `WASD` / Arrow keys for movement, Mouse cursor raycast onto the 3D floor plane for precision aiming, Left-Click (or `Space` / Auto-Fire toggle) to shoot.

## 7. Low-Level Game Logic & Simulation Specifications

### 7.1 Simulation Loop, Game Speed & Arena Scale

To guarantee deterministic gameplay across 60Hz mobile browsers, 144Hz desktop monitors, and future authoritative server ticks, **Simulation Ticks** are strictly decoupled from **Render Frames**:

* **Fixed Simulation Step:** $\Delta t = \frac{1}{60}\text{ s}$ ($16.67\text{ ms}$ per tick) using an accumulator loop (capped at a maximum of $4$ catch-up steps per frame to prevent spiral-of-death stalls).
* **World Coordinate Scale:** $1\text{ world unit} = 1\text{ arena tile}$ ($1\text{ meter}$ in Three.js).
  * **Arena Dimensions:** $64 \times 64\text{ units}$ (Endless & 3-Min Blitz) | $80 \times 80\text{ units}$ (Battle Royale).
  * **Entity Hitbox Radius:** $r_{entity} = 0.55\text{ units}$.
  * **Projectile Hitbox Radii:** Standard Arrow $r_{proj} = 0.18\text{ units}$; Shuriken $0.22\text{ units}$; Scythe $0.45\text{ units}$ (*Giant Arrows* upgrade scales radius by $\times 1.6$).
* **Baseline Movement & Weapon Speeds:**
  * **Base Move Speed:** $v_{base} = 6.5\text{ units/sec}$ (Acceleration: $45\text{ units/s}^2$; release damping: $0.85$ for crisp, responsive stops).
  * **Standard Arrow:** $s_{arrow} = 18.0\text{ units/sec}$ | Max Range: $16.0\text{ units}$ ($\approx 0.89\text{s}$ lifetime).
  * **Shuriken:** $s_{shuriken} = 21.0\text{ units/sec}$ | Max Range: $14.0\text{ units}$.
  * **Scythe:** $s_{scythe} = 12.5\text{ units/sec}$ | Max Range: $13.0\text{ units}$ (visual spin rate: $720^\circ/\text{sec}$).
  * **Laser Beam:** Instant hitscan raycast up to $18.0\text{ units}$ (visual beam persists for $0.14\text{s}$).
  * **Base Fire Rate:** $1.6\text{ shots/sec}$ ($0.625\text{s}$ cooldown).

### 7.2 Physics & Collision Engine (`PhysicsEngine.ts`)

Because combat occurs on the horizontal $X\text{–}Z$ plane ($Y$ is visual height only), collision detection runs in **2D Circle-vs-AABB and Circle-vs-Circle space** ($<0.2\text{ ms}$ per tick with 300+ active projectiles):

1. **Spatial Grid Hashing ($8 \times 8\text{ unit cells}$):**
   * Dynamic entities and static wall blocks are indexed into spatial grid buckets every tick so projectile collision checks query only local and adjacent cells ($O(1)$ average complexity).
2. **Sliding Circle-vs-AABB Wall Resolution:**
   * Compute closest point $\vec{c} = (c_x, c_z)$ on wall box $[min_x, max_x] \times [min_z, max_z]$ to entity center $\vec{p} = (p_x, p_z)$.
   * If distance $d = \Vert\vec{p} - \vec{c}\Vert < r_{entity}$, displace entity outward along normal $\vec{n} = \frac{\vec{p} - \vec{c}}{d}$ by $(r_{entity} - d)$, enabling smooth wall-sliding during diagonal movement.
3. **Projectile-vs-Wall Reflection (Wall Bounce Math):**
   * On wall penetration, determine the hit face normal $\vec{n}$ from the minimum overlap axis ($X$ vs. $Z$).
   * If `bouncesRemaining > 0`:
     $$\vec{v}_{new} = \vec{v} - 2(\vec{v} \cdot \vec{n})\vec{n}$$
     Decrement `bouncesRemaining`, clear the projectile's `hitEntities` exclusion set (allowing bank shots to strike targets after rebounding), and emit a bounce ring effect.
   * Otherwise, spawn wall impact particles and destroy the projectile.
4. **Anti-Tunneling Sub-Stepping:**
   * Projectiles exceeding $20\text{ units/sec}$ integrate in two half-steps ($\frac{\Delta t}{2}$) per tick so fast shots never skip through thin obstacles or entity hitboxes.

### 7.3 AI Bot Decision & Aiming Algorithms (`BotBrain.ts` & `AimSolver.ts`)

Each AI bot executes a **Perception** $\rightarrow$ **Context Steering** $\rightarrow$ **Ballistic Solver** pipeline on a difficulty-scaled brain interval while interpolating steering and rotation smoothly at 60Hz:

#### A. Quadratic Ballistic Intercept (Predictive Aiming)

Given shooter position $\vec{P}_s$, projectile speed $s$, target position $\vec{P}_t$, and target velocity $\vec{V}_t$, let $\vec{D} = \vec{P}_t - \vec{P}_s$. Solve for impact time $t > 0$:

$$(\vec{V}_t \cdot \vec{V}_t - s^2)t^2 + 2(\vec{D} \cdot \vec{V}_t)t + (\vec{D} \cdot \vec{D}) = 0$$

* Select the smallest positive real root $t$.
* Compute predicted aim coordinate:
  $$\vec{P}_{aim} = \vec{P}_t + \vec{V}_t \cdot (t \cdot \text{leadFactor})$$
* **Wall-Bounce Bank Shot (Hard AI Only):** When direct line-of-sight is blocked by a wall and `bot.wallBounce > 0`, the solver mirrors $\vec{P}_t$ across the four nearest wall planes, casts a validation ray toward each virtual reflection point, and executes ricochet shots around corners.

#### B. Context Steering Map (16-Ray Movement & Evasion)

On each brain update, Normal and Hard bots evaluate **16 radial feeler vectors** ($22.5^\circ$ increments) around their position:

* **Hazard Penalties:** Feelers intersecting a wall within $1.2\text{ units}$ or pointing outside the Battle Royale safe ring receive `-100`.
* **Incoming Projectile Evasion (Hard AI):** Projects all enemy projectiles within $8.0\text{ units}$ forward by $0.45\text{s}$. Feelers aligned with a threat trajectory receive `-80`, while perpendicular directions receive `+60`, producing crisp sidestep dodges while maintaining return fire.
* **Tactical State Weights:**
  * *Forage State ($\text{HP} > 60\%$, no close threat):* Steers toward the highest-value nearby XP gem cluster.
  * *Combat / Kiting State (Enemy in range):* Maintains optimal weapon spacing ($9\text{–}12\text{ units}$ for ranged/laser archetypes; $3\text{–}5\text{ units}$ for *Reaper* scythes) while strafing.
  * *Retreat State ($\text{HP} < 30\%$):* Prioritizes nearest Health Heart and breaks line-of-sight behind wall cover.

#### C. AI Difficulty Parameter Matrix

| Parameter | Easy Bot | Normal Bot | Hard Bot ("Pro Player") |
| :--- | :--- | :--- | :--- |
| **Brain Update Interval** | `450 ms` | `200 ms` | `80 ms` |
| **Velocity Lead Factor** | `0.0` (aims at current position) | `0.65` (partial lead) | `1.0` (exact quadratic intercept) |
| **Aim Spread Jitter** | $\pm 16^\circ$ | $\pm 6^\circ$ | $\pm 1.2^\circ$ |
| **Projectile Dodging** | None | Slow scythes only | Full perpendicular sidestepping |
| **Wall Bank Shots** | Disabled | Disabled | Enabled (when Bounce upgraded) |
| **Upgrade Draft Logic** | Random selection | Weighted by rarity | Synergy-scored combo builder |

### 7.4 XP Progression, Multishot & Damage Math

* **Level-Up XP Curve:**
  $$\text{XP}_{required}(L) = 10 + (L - 1) \times 8 + \lfloor (L - 1)^{1.35} \times 3 \rfloor$$
* **Multishot Stacking Rules:**
  * **Front Arrow (+1):** Spawns parallel projectiles offset by $\pm 0.22\text{ units}$ perpendicular to aim direction ($85\%$ per-arrow damage multiplier when stacked to preserve time-to-kill balance).
  * **Diagonal Arrows (+2):** Adds firing angles at $\pm 30^\circ$ ($100\%$ base damage each).
  * **Side Arrows (+2):** Adds firing angles at $\pm 90^\circ$.
  * **Rear Arrow (+1):** Adds barrel at $180^\circ$.
* **Final Damage Formula:**
  $$\text{FinalDamage} = \text{BaseWeaponDmg} \times (1 + 0.15 \times \text{DmgStacks}) \times \text{MultishotFactor} \times (\text{isCrit} ? 1.75 : 1.0)$$

## 8. 3D Map Design, Data Schema & Arena Layout (`MapData.ts`)

### 8.1 Core Map Design Principles
* **No Dead-End Traps:** Every room, corridor, and alcove has **at least 2 exits** so players can always strafe or kite out of crossfire without getting pinned.
* **Choke Points vs. Open Plazas:** Combines tight $3\text{–}4\text{ unit}$ corridors (maximizing *Wall Bounce* and *Piercing* value) with wider $10\text{–}14\text{ unit}$ open plazas for high-speed dodging.
* **Low-Profile Wall Height ($Y = 1.1\text{ units}$):** Tall enough to block arrows and cast crisp directional shadows, yet low enough that walls **never obscure characters or floating health bars** from the $62^\circ$ isometric camera angle.

### 8.2 Shared Data-Driven Map Schema
Maps are authored in `/src/core/MapData.ts` as pure 2D AABB rectangles (`{ id, minX, minZ, maxX, maxZ, height, kind }`) and safe spawn coordinates (`SpawnPoint[]`):
* **Deterministic Physics:** `PhysicsEngine.ts` reads the exact AABB bounds for Circle-AABB sliding and bounce normals.
* **Single-Draw-Call Instancing:** `SceneManager.ts` batches all interior walls into one `THREE.InstancedMesh` so the entire maze renders in **1 GPU draw call** on mobile devices.

### 8.3 Symmetric 4-Quadrant Arena Layout
1. **Perimeter Border Walls:** Thick outer frame ($2.0\text{ units}$ wide, $1.6\text{ units}$ tall) enclosing `[-HalfSize, +HalfSize]`.
2. **Center Crossroads Plaza:** A high-traffic $16 \times 16\text{ unit}$ central arena framed by **4 symmetrical L-shaped cover pillars**, featuring boosted Gold/Green XP gem and Health Heart spawn weights.
3. **Mid-Ring Labyrinth Rooms:** Each of the 4 quadrants contains **3–4 staggered rectangular and L-shaped blocks** separated by $3.5\text{ unit}$ walkways—wide enough for two characters to strafe past each other, narrow enough for tactical bank shots.
4. **Spawn Point Selection:** Pre-placed corridor intersection nodes; spawns pick the node maximizing distance to the nearest living enemy (and inside the safe ring during Battle Royale).

### 8.4 Three.js Visual Layering & Swappable Themes
* **Procedural Grid Floor Texture:** $512 \times 512$ `CanvasTexture` with $1\text{ unit}$ tile grid lines, corner dots, and `anisotropy = 4` so lines stay crisp at grazing camera angles.
* **Wall Top Bevel Contrast:** Wall top caps use a slightly lighter tone than vertical faces so obstacle silhouettes stand out clearly.
* **Shrinking Zone Mesh (Battle Royale):** Open-ended crimson `CylinderGeometry` (`opacity: 0.28`, `DoubleSide`) paired with a glowing ground boundary ring at $Y = 0.05$.
* **Theme Palettes:**
  * *Classic Grid (Default):* Off-white floor (`#F1F5F9`), slate-blue walls (`#64748B` / `#94A3B8`).
  * *Sandstone Ruins:* Warm sand floor (`#F5EFE6`), terracotta/ochre walls (`#C2855A`).
  * *Cyber Neon:* Dark charcoal floor (`#0F172A`), obsidian walls with cyan top trims (`#06B6D4`).

## 9. Decoupled Architecture (Offline Now $\rightarrow$ Multiplayer Later)

```text
/src
 ├── /core          # Pure deterministic simulation (ZERO Three.js or DOM imports)
 │    ├── MapData.ts        # AABB wall definitions, spawn nodes & theme palettes
 │    ├── WorldState.ts     # Entities, projectiles, XP gems, shrinking zone state
 │    ├── PhysicsEngine.ts  # Spatial hash grid, Circle-AABB walls, bounce reflection
 │    ├── UpgradePool.ts    # Skill definitions, stat modifiers, synergy weights
 │    └── GameModes.ts      # Endless, Battle Royale, and 3-Min Blitz rulesets
 ├── /ai            # Bot controllers (reads WorldState -> outputs InputCommands)
 │    ├── AimSolver.ts      # Quadratic intercept + wall-bounce raycaster
 │    └── BotBrain.ts       # Context steering + Easy / Normal / Hard state machines
 ├── /network       # Transport adapter pattern
 │    ├── LocalLoopAdapter.ts   # Runs /core + /ai locally at 60Hz (Phase 1)
 │    └── SocketAdapter.ts      # Multiplayer client transport (Phase 2)
 ├── /render        # Three.js presentation layer
 │    ├── SceneManager.ts   # Camera, directional shadows, instanced walls, zone cylinder
 │    ├── VoxelBuilder.ts   # Procedural 3D characters, weapons & walk animations
 │    └── ParticleFX.ts     # Instanced sparks, voxel death bursts, projectile trails
 └── /ui            # HUD, dual virtual joysticks, 3-card draft modal, scoreboard
```

### Phase 2 Backend Stack Strategy (Multiplayer, Auth & Progression)

Because `/core` has zero dependency on rendering or browser DOM APIs, transitioning to online multiplayer requires minimal refactoring:

1. **Authentication & Account Progression (Hybrid API):**
   * **Stack:** **Supabase Auth** or **TypeScript (Hono / Fastify) + PostgreSQL**.
   * **Flow:** Handles Discord/Google OAuth, user profiles, coins, and unlocked characters. On login, issues a signed **JWT** containing `{ userId, unlockedCharacters, equippedSkin }`.
2. **Real-Time Authoritative Combat Server:**
   * **Option A (Fastest Time-to-Multiplayer):** **Colyseus** with `@colyseus/uwebsockets-transport` — shares the exact TypeScript `/core` simulation code and provides automatic binary delta compression (`@colyseus/schema`).
   * **Option B (Ultra-Low RAM & Maximum Speed):** **Rust (`tokio` + `tokio-tungstenite` + `bincode`)** or **Go (`gobwas/ws` + `protobuf`)** — verifies the JWT in microseconds on WebSocket handshake, runs authoritative 30Hz–60Hz arena rooms in ~20–40 MB RAM, and broadcasts compact binary state snapshots.

## 10. Development Roadmap

* **Milestone 1 (Barebones Arena & Movement):** Set up Vite + TypeScript + Three.js, load `MapData.ts`, and implement the 60Hz fixed-timestep movement and wall-sliding loop.
* **Milestone 2 (Voxel Rigs & Projectiles):** Build `VoxelBuilder.ts` procedural characters, firing angles, anti-tunneling sub-steps, and wall-bounce reflection.
* **Milestone 3 (XP Gems & 3-Card Draft):** Implement magnet gem pickups, level-up XP curve, and the 3-card upgrade modal.
* **Milestone 4 (Smart AI Bots):** Implement `AimSolver.ts` (quadratic ballistic intercept + bank shots) and `BotBrain.ts` (16-ray context steering).
* **Milestone 5 (Modes, Audio & Open-Source Release):** Add Battle Royale shrinking zone, 3-Min Blitz, procedural Web Audio SFX, and publish on GitHub.
* **Milestone 6 (Multiplayer & Progression):** Connect `SocketAdapter` to the authoritative server and JWT Auth/Progression API.