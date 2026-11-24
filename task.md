# Dart.io — Implementation Task Tracker

> Living document. Check off `[x]` as work completes and append notes to the **Progress Log**.
> Source of truth: `game_design_architecture_plan.md`. Offline phase (Milestones 1–5) is the target;
> Phase 2 multiplayer backend is scaffolded via the transport adapter pattern.

---

## Category 0 — Project Setup & Tooling
- [x] 0.1 `package.json` with Vite, TypeScript, Three.js deps and scripts (`dev`, `build`, `typecheck`, `preview`)
- [x] 0.2 `tsconfig.json` (strict, ESNext, bundler resolution, DOM libs)
- [x] 0.3 `vite.config.ts`
- [x] 0.4 `index.html` mount point + `<canvas>`/app root
- [x] 0.5 Install dependencies (`npm install`) and confirm toolchain works

## Category 1 — Core Simulation (`src/core`, ZERO Three.js/DOM)
- [x] 1.1 `types.ts` — shared types/enums (Vec2, Entity, Projectile, Gem, InputCommand, GameModeId, etc.)
- [x] 1.2 `constants.ts` — all tunable constants from §7 (speeds, radii, arena sizes, AI matrix, XP formula params)
- [x] 1.3 `MapData.ts` — AABB wall definitions, spawn nodes, symmetric 4-quadrant layout, 3 theme palettes (§8)
- [x] 1.4 `SpatialGrid.ts` — 8×8 cell hash grid, insert/query/clear (§7.2)
- [x] 1.5 `WorldState.ts` — entity/projectile/gem stores, shrinking-zone state, RNG
- [x] 1.6 `PhysicsEngine.ts` — circle-AABB sliding, circle-circle, projectile reflection, anti-tunnel sub-steps (§7.2)
- [x] 1.7 `UpgradePool.ts` — skill definitions, stat modifiers, multishot/damage math, synergy weights (§5, §7.4)
- [x] 1.8 `GameModes.ts` — Endless / Battle Royale / Blitz rulesets & state machine (§4)
- [x] 1.9 `World.ts` — orchestrator: fixed-step `step()`, combat, XP, gems, respawns, zone damage, events

## Category 2 — AI (`src/ai`)
- [x] 2.1 `AimSolver.ts` — quadratic ballistic intercept, lead factor, wall-bounce bank shot raycast (§7.3A)
- [x] 2.2 `BotBrain.ts` — 16-ray context steering, tactical states, Easy/Normal/Hard parameter matrix (§7.3B/C)
- [x] 2.3 Bot upgrade drafting (random / weighted / synergy-scored)

## Category 3 — Network / Transport (`src/network`)
- [x] 3.1 `TransportAdapter.ts` — interface for adapter pattern
- [x] 3.2 `LocalLoopAdapter.ts` — runs core + AI locally at 60Hz (Phase 1)
- [x] 3.3 `SocketAdapter.ts` — documented Phase 2 stub (client transport)

## Category 4 — Rendering (`src/render`)
- [x] 4.1 `SceneManager.ts` — WebGPU→WebGL2 renderer, iso camera + spring damping, lights/shadows, instanced walls, grid floor, zone cylinder
- [x] 4.2 `VoxelBuilder.ts` — procedural voxel characters, weapons, walk/firing animation, nameplates, health bars
- [x] 4.3 `ParticleFX.ts` — instanced sparks, voxel death bursts, projectile trails, bounce rings

## Category 5 — Input (`src/input`)
- [x] 5.1 `InputManager.ts` — WASD/arrows + mouse raycast aim + click/Space/auto-fire (desktop)
- [x] 5.2 Dual floating virtual joysticks + quick-tap nearest-enemy fire (touch)

## Category 6 — Audio (`src/audio`)
- [x] 6.1 `SoundFX.ts` — procedural Web Audio: twang, zap, bounce ping, XP chime, level-up fanfare, hit/death

## Category 7 — UI (`src/ui`)
- [x] 7.1 `HUD.ts` — health/XP bars, timer, score, leaderboard, kill feed, mode banner
- [x] 7.2 `DraftModal.ts` — paused 3-card upgrade draft with slow-motion
- [x] 7.3 `Joysticks.ts` — touch joystick visuals
- [x] 7.4 `Menu.ts` — main menu (mode select, character select, start)
- [x] 7.5 `styles.css` — full HUD/menu styling, theme accents

## Category 8 — Integration
- [x] 8.1 `main.ts` — bootstrap, fixed-timestep accumulator loop (cap 4 catch-up steps), wire core↔render↔ui↔input↔audio
- [x] 8.2 Event bus / signal wiring (damage, pickup, level-up, death, bounce)
- [x] 8.3 Character archetypes wired (5) with passives & starting weapons

## Category 9 — Verification & Polish
- [x] 9.1 `npm run typecheck` passes with zero errors
- [x] 9.2 `npm run build` production bundle succeeds
- [x] 9.3 README quick-start / controls section updated
- [x] 9.4 Manual playtest notes / smoke-test checklist

---

## Category 10 — Optimizations & Gameplay Tuning (user follow-up)
- [x] 10.1 Enlarge arenas (Standard 64→96, Royale 80→120) and scale camera/fog/grid
- [x] 10.2 Spawn separation: never spawn within a minimum distance of any living character; add more spawn nodes
- [x] 10.3 Measurement system: 1 world unit = 1 m = 39.37 in; imperial (default) / metric toggle + HUD readouts
- [x] 10.4 Make projectiles and laser beams clearly visible (size, glow, stretch, halo)
- [x] 10.5 New animated 3D EXP Orbs (10/25/50 XP by size) with standby + pickup animations
- [x] 10.6 Level range 0–20 with curve: 0→1 = 10 XP, then +200 per level (L→L+1 = 200·L)
- [x] 10.7 Kill XP reward = 50 + 50 × victim level (capped 1000)
- [x] 10.8 Characters grow in size with level (hitbox + visual scale)
- [x] 10.9 Fixed slow move speed for everyone; larger characters walk slower
- [x] 10.10 Fixed 1.0 s attack interval for all characters; remove attack-speed upgrade
- [x] 10.11 Reinforce bots when population is low, at levels ≤ player level and ≤ max level
- [x] 10.12 Character select: rotating 3D model preview + abilities/passives panel
- [x] 10.13 Always-on auto-attack (no toggle) for players

## Category 11 — Arsenal, Weapon Visuals & Attack Animation
- [x] 11.1 Arsenal system: upgrades ADD weapons instead of replacing; character fires every owned weapon
- [x] 11.2 Expose all 5 weapons (bow, shuriken, scythe, laser, bolt) as upgrade cards
- [x] 11.3 Weapon upgrades (damage / size / range / velocity) + new effects (explosive, chain, vampiric)
- [x] 11.4 Refactor weapon stats into per-weapon profiles derived from shared multipliers
- [x] 11.5 Distinct projectile models — black arrow for bow/bolt, shuriken, scythe — with reliable visibility
- [x] 11.6 Projectiles spawn at the character's weapon muzzle with recoil + muzzle flash animation
- [x] 11.7 Verify no projectiles vanish on spawn; full build + smoke + browser check
- [x] 11.8 Orb pickup uses a common absorb animation that flies the orb into the collecting character

## Category 12 — Upgrade Draft Revamp & Magic Arrow
- [x] 12.1 Three-tier rarity: common (the rest, equal odds), rare (character stats), super rare (weapon effects + magic arrow)
- [x] 12.2 New super-rare Magic Arrow with strong built-in homing/tracking
- [x] 12.3 Rework draft offer weights so common cards are equally likely and rare tiers are proportionally rarer
- [x] 12.4 Update draft modal category icons/labels and super-rare styling
- [x] 12.5 Verify odds math + build + smoke + browser check

## Category 13 — Projectile Clarity & Per-Character Animation
- [x] 13.1 Fan out muzzle positions per arsenal weapon so shots don't stack into an invisible blob
- [x] 13.2 Distinct projectile models/colors per weapon: black arrow, red bolt, cyan shuriken, emerald scythe, purple magic arrow, cyan laser
- [x] 13.3 Per-archetype walking animations (speed/style) and per-archetype attacking animations
- [x] 13.4 Build + smoke + browser verification with a full six-weapon arsenal
- [x] 13.5 Fix multishot (rear/diagonal) arrows vanishing: spawn each shot outside the character in its own direction + wall grace period + reliable per-projectile rendering
- [x] 13.6 Add "Back to Home" button to the death/game-over menu that tears down the match and restores the main menu

## Category 14 — Manual Aim & Dual-Stick Controls
- [x] 14.1 Remove forced auto-attack; firing requires explicit aim/fire input
- [x] 14.2 Keyboard: WASD movement, Arrow keys aim, Click/Space fire
- [x] 14.3 Touch: left joystick walks, right joystick aims + fires, quick-tap snaps to nearest enemy
- [x] 14.4 Update HUD/menu/README control hints
- [x] 14.5 Build + smoke + browser verification
- [x] 14.6 Add a short ghost aim arrow showing the player's aim direction (about 2× character height)
- [x] 14.7 Both joysticks visible/usable on PC with mouse; firing only by dragging and releasing the right aim stick; remove click/Space spam
- [x] 14.8 PC mouse aims anywhere on screen; mobile aims with the right joystick; PC right-stick drag is fire-only
- [x] 14.9 Raise joystick resting positions and let the right stick spawn wherever the click/touch lands on the right half

## Category 16 — Innate Ability Filtering & Left Aim
- [x] 16.1 Keep Sun Sovereign's innate homing passive, but never offer the Homing upgrade to a character that already has homing
- [x] 16.2 Fix PC left aim: visual model had a 90° rotation offset so it never faced left; align model rotation with simulation facing
- [x] 16.3 Build + smoke + browser verification

## Category 17 — Melee Weapons & Wall Phasing
- [x] 17.1 Add sword + hammer melee weapons with short-range arc attacks and draft cards
- [x] 17.2 Melee swing visuals + held weapon models + bot spacing support
- [x] 17.3 Characters pass through walls automatically (no sticking), projectiles still bounce
- [x] 17.4 Build + smoke + browser verification

## Category 18 — Spikes, Metal Shoes & Orbiting Weapons
- [x] 18.1 Spike weapon: place damage spikes on the ground; owner immune, others (and map spikes) not
- [x] 18.2 Map spike hazards + spike rendering
- [x] 18.3 Metal Shoes upgrade: full spike immunity
- [x] 18.4 Weapon Orbit upgrade: weapon circles the character and damages nearby enemies
- [x] 18.5 Build + smoke + browser verification

## Category 19 — Rotating Shuriken & Shield Upgrades
- [x] 19.1 Rotating Shuriken: stackable to 6, one extra orbiting shuriken per stack, damages enemies
- [x] 19.2 Rotating Shield: stackable to 4, orbiting shields that reduce incoming damage and strike enemies
- [x] 19.3 Orbit visuals for both upgrade types
- [x] 19.4 Build + smoke + browser verification

## Category 20 — Upgrade Cleanup & Health Orbs
- [x] 20.1 Remove Max HP and Move Speed upgrade cards
- [x] 20.2 Health pickups are heart-shaped and fewer than EXP orbs (5 vs 40, 6.5s vs 2.5s respawn)
- [x] 20.3 Build + smoke + browser verification

## Category 21 — Segmented Health & Damage Rebalance
- [x] 21.1 Health bars: 3 at level 0, +2/level to 10, +1/level from 11–20
- [x] 21.2 Lower all base weapon damage to 1–2; upgrades provide the scaling
- [x] 21.3 HUD segmented health display + level-up heals the added bars
- [x] 21.4 Rebalance hazards/heals/effects for the new HP scale
- [x] 21.5 Build + smoke + browser verification

## Category 22 — Stick-Based Aiming on PC
- [x] 22.1 PC aim follows the right joystick direction instead of mouse position
- [x] 22.2 Keep last aim direction when no stick/arrow input; remove mouse raycast aim
- [x] 22.3 Update control hints + build/browser verification

## Category 23 — Themed Cursor
- [x] 23.1 Procedural SVG crosshair cursor matching the voxel/arcade theme
- [x] 23.2 Matching hover cursor for buttons/cards/joysticks
- [x] 23.3 Build + browser verification

## Category 15 — Nostalgia Pass (original homage, no copied assets)
- [x] 15.1 Research source APK mechanics (Lua configs + IL2CPP metadata) — pets, conversions, multishot, crit/shield, kill callouts
- [x] 15.2 Sidekick pet system: orbiting companions that auto-fire (Sickle / Laser / Shuriken / Bomb Orb), super-rare drafts
- [x] 15.3 Kill-streak callouts ("First Blood / Double Kill / Killing Spree") in the HUD feed
- [x] 15.4 Expand roster with three original archetypes with distinct voxel silhouettes
- [x] 15.5 Visual style pass: brighter palette, chunkier voxels, more top-down camera
- [x] 15.6 Build + smoke + browser verification

## Progress Log
- **2026-11-24 — Start:** Repo was empty (only README, AGENTS.md, plan, public assets). No graphify-out present; codebase too small to graph yet. Began from scratch.
- **2026-11-24 — Core:** Implemented all `/src/core` modules. `npx tsc --noEmit` clean. Fixed initial import/const-literal errors.
- **2026-11-24 — AI + Transport:** Implemented ballistic intercept, bank shots, 16-ray context steering, 3 difficulty tiers; adapter pattern with local loop and Phase 2 stub.
- **2026-11-24 — Rendering + UI + Integration:** Full Three.js scene, voxel rigs, particles, input, Web Audio, HUD/menu/draft. Browser smoke test confirmed playable menu → match flow.
- **2026-11-24 — Bug fixes from testing:**
  - Bots were passed archetype IDs instead of weapon IDs in `recomputeStats` (crash on startup).
  - Pickup regrow timers were local (reset each tick) → moved to instance fields.
  - `instanceColor` + `vertexColors` conflict made gems/particles render black → removed `vertexColors`.
  - Stat upgrades weren't recording stack counts → broke draft caps and respawn rebuilds.
  - Initial spawn always chose arena center → player was instantly focused by all bots; now randomized + 3s spawn protection + 4s bot grace period.
- **2026-11-24 — Verification:** `npm run build` succeeds. Headless smoke test runs all 3 modes for 2400 ticks without errors. Browser verified: menu, all 3 modes, HUD, gems/hearts, zone HUD, level-up draft modal and card selection/resume. No console errors (WebGPU falls back to WebGL2 as designed).
- **Note:** `graphify-out/` could not be initialized — the `graphify` CLI is not installed or on PATH in this environment. The repo had no source files at session start, so there was no graph to consult; code was organized directly from the plan's architecture tree.
- **2026-11-24 — Category 10 (tuning pass):** Enlarged arenas to 96/120 with denser spawn grid and 7-unit minimum spawn separation. Added pure measurement utilities (`src/core/Units.ts`) + persisted imperial/metric toggle in HUD. Added 40 animated 10/25/50-XP orbs with standby drift/pulse and expand-and-rise pickup animation. Reworked levels to 0–20 with the 10/200/400… curve, kill XP 50–1000 by victim level, level-based growth of hitbox and model, fixed 3.6 m/s base speed reduced by size, and a universal 1.0 s attack interval (attack-speed upgrade removed). Added low-population bot reinforcement at levels ≤ player level. Added a rotating 3D character preview with abilities/passives to the menu, and made auto-attack mandatory.
- **2026-11-24 — Verification (tuning pass):** Extended `scripts/smoke.ts` with assertions for XP curve, fixed speed, spawn separation, level cap, orb presence and reinforcement — all passing across 3600 ticks per mode. Browser verified: menu model preview, imperial/metric toggle, enlarged arena, purple orbs (fixed a color washout), HUD level readout and level-based growth. `tsc` clean.
- **2026-11-24 — Category 11 (arsenal pass):** Replaced weapon *conversion* upgrades with an **arsenal**: each weapon card adds a weapon and every owned weapon fires on every attack (a real strength increase). All five weapons are now draftable. Refactored weapon stats into shared multipliers + per-weapon `weaponProfile()`. Added weapon tuning cards (damage/size/range/velocity) and effects (explosive AoE, chain lightning, vampiric healing) with event-driven visuals. Replaced the single generic projectile instance with a dedicated black arrow model (shaft + head + fletching, with a yellow halo) for bow/bolt, a shuriken model and a scythe blade model. Projectiles now spawn from a computed weapon muzzle; recoil is synced to the attack cooldown and a muzzle flash appears on each shot. Also fixed the "disappearing arrows" readability issue by enlarging and color-coding projectile models.
- **2026-11-24 — Verification (arsenal pass):** Extended smoke test with arsenal assertions (upgrades add weapons; bow + shuriken projectiles and a laser beam all fire from one attack) — passing. `npm run build` clean. Verified in the user's Chrome via the new `browse` tools: draft cards include all weapon/effect options, arsenal upgrades apply, and black arrows + shuriken render clearly.
- **2026-11-24 — Orb absorb:** Replaced the in-place expansion pickup with a shared absorb animation: the orb now records the collecting character, flies from its collection point into that character with smoothstep easing, shrinks as it's absorbed, and bursts at the character on completion. Smoke test asserts the orb homes toward the collector (0.40 → 0.27 units). `npm run build` clean.
- **2026-11-24 — Category 12 (draft revamp):** Collapsed rarity to three tiers — common (everything except stats/effects, all equal odds), rare (all character stats), super rare (all weapon effects plus the new Magic Arrow). Added the super-rare Magic Arrow weapon with built-in homing strength 7, its own purple arrow model and wand. Replaced the broken score-sort draft with proper weighted sampling without replacement; measured 6000 offers at ~91% common / 7% rare / 1.5% super rare. Draft modal now shows category icons and distinct SUPER RARE styling. Smoke assertions cover tier assignment, odds ordering, and Magic Arrow tracking. `npm run build` clean; browser verified all three rarity badges render.
- **2026-11-24 — Category 13 (projectile clarity + animation):** Diagnosed the "invisible projectiles with multiple weapons" bug: all arsenal weapons spawned at the exact same muzzle, stacking into one blob. Each weapon now fires from a fanned-out muzzle offset (smoke test: 5 distinct spawn points from one attack). Gave every projectile a unique model/color — black arrow + yellow halo (bow), dark-red arrow + red halo (bolt), cyan four-point shuriken, emerald scythe arc, purple magic arrow + violet halo, cyan laser. Added per-archetype walk speed/amplitude (shinobi darts, reaper/knight plod) and distinct attack poses (bow draw, shuriken throw, scythe sweep, rifle recoil, crossbow thrust) with weapon-colored muzzle flashes. `npm run build` clean; browser verified a full six-weapon arsenal shows clearly separated, color-coded shots.
- **2026-11-24 — Multishot vanishing fix:** Rear/diagonal/side shots were spawning from the forward muzzle and travelling through the character body, so they appeared to vanish. Each shot now spawns from the character centre along **its own travel direction**, just outside the hitbox, with perpendicular offsets relative to that shot's angle. Added a short wall-collision grace period so shots aren't destroyed on their first tick. Also replaced `InstancedMesh` projectile rendering with **pooled individual meshes** after browser inspection showed only one arrow instance ever drawing. Smoke test: 10 multishot shots, min spawn distance 1.73 units, all survive 3 ticks. Browser screenshot confirms the full forward/rear/diagonal/side fan renders. `npm run build` clean.
- **2026-11-24 — Home button:** The death menu now has a "⌂ BACK TO HOME" button alongside "PLAY AGAIN". It unsubscribes event listeners, stops the transport, clears entity/projectile/zone visuals, hides the HUD/draft, and restores the main menu. Browser verified: game over → Home shows the menu with no world running, and starting a new match afterwards works. `npm run build` clean.
- **2026-11-24 — Category 14 (manual aim):** Replaced forced auto-attack with explicit fire input. Desktop uses WASD for walking, Arrow keys (or mouse) for aiming, and left-click/Space to fire. Touch keeps dual joysticks: left walks, right aims; a bare tap does nothing — drag to aim then release to fire. Added an edge-triggered `firePressed` input and removed the player cooldown gate (one shot per press; cooldown value remains only for the recoil animation). Bots still fire on their own cadence. Added a short cyan ghost aim arrow (~2× character height) that tracks the player's facing. Browser verified: two rapid mousedowns fire two shots immediately, the ghost arrow tracks aim, and touch taps no longer auto-fire. `npm run build` clean.
- **2026-11-24 — Category 15 (nostalgia pass):** Studied the user's Arrow.io 1.8.2 APK purely as a *mechanical* reference (Lua JSON configs + IL2CPP metadata strings) — confirmed sidekick pets, weapon conversions, forward/back multishot levels, crit/shield/health abilities and kill callouts. Rebuilt these as original Dart.io systems: four orbiting sidekick pets (Sickle Familiar, Laser Wisp, Shuriken Sprite, Bomb Orbit) as super-rare drafts that fire independently; kill-streak callouts (First Blood!/Double Kill!!/Killing Spree!!!/Rampage!); three new original archetypes (Jackal Warden, Sun Sovereign, Strike Commando) with distinct voxel silhouettes and attack styles; brighter palette and a more top-down 68° camera. No APK textures, audio, code, names or trademarks were used. Smoke test verifies pets spawn and fire; browser verified the 8-character roster and all four pet models orbiting. `npm run build` clean.
- **2026-11-24 — PC joysticks / no spam:** Both on-screen joysticks are now always visible and usable with the mouse on PC as well as touch on mobile. Removed all click/Space firing. A shot only happens by dragging the right stick and releasing it; a bare tap or click fires nothing. WASD/arrow keys remain movement/aim alternatives but cannot fire. Browser verified with bots disabled: drag-release produced exactly 1 player projectile, a bare tap produced 0. `npm run build` clean.
- **2026-11-24 — PC mouse aim:** Mouse now aims anywhere on the screen on PC (raycast to floor); the right stick's drag no longer overrides mouse aim and is purely the fire trigger on PC. Touch keeps right-stick aiming + firing. Browser verified mouse aim stayed constant during a right-stick drag and release fired exactly one shot. `npm run build` clean.
- **2026-11-24 — Joystick placement:** Resting stick bases moved up and inward (140px from sides, 175px from bottom). The right stick now spawns wherever you click/touch on the right half of the screen, so you don't have to reach for a fixed corner; touch sticks still spawn at the finger. Left stick stays anchored near its resting spot. Browser verified the right base jumps to the click point and drag-release still fires exactly one shot. `npm run build` clean.
- **2026-11-24 — Innate filtering & left aim:** Kept Sun Sovereign's innate homing passive as requested, but `rollDraft` now excludes the Homing upgrade for any character that already has homing (smoke test: 300 drafts, never offered). Diagnosed the PC left-aim complaint: simulation aimed correctly (aimX -1, facing π) but `EntityVisual` applied a +90° rotation offset, so the model never visually faced left. Changed model rotation to exactly `-facing`. Browser verified aimX -1, facing 3.12, model rotation -3.12 and the ghost arrow pointing left. `npm run build` clean.
- **2026-11-24 — Category 17 (melee + wall phasing):** Added draftable Steel Sword and War Hammer — instant close-range forward-arc attacks (65° half-angle) that hit all enemies in range, with pooled fading arc visuals, held weapon models, and bot spacing support. Removed entity-vs-wall collision resolution: characters now phase straight through interior walls and can never get stuck (arena perimeter still clamps them; projectiles still collide/bounce). Smoke test: sword hit for 36 damage with 1 swing visual, character walked from -15.9 to -10.7 through a wall. Browser verified arc visual and damage. `npm run build` clean.
- **2026-11-24 — Category 18 (spikes/orbit):** Added the Ground Spikes weapon (places spikes ahead of the character, owner immune, others hurt once per spike), 18 map-owned spike hazards, pooled red/purple spike cone visuals, the Metal Shoes rare upgrade (full spike immunity), and the Orbiting Weapon upgrade (weapon circles the character visually and damages nearby enemies on an 0.8s per-target interval). Smoke test: spike hurt an enemy 100→60 while the owner stayed at 100, Metal Shoes blocked a map spike, and the orbit damaged an enemy 110→104. Browser verified 19 spike meshes visible and upgrades applied. `npm run build` clean.
- **2026-11-24 — Category 19 (rotating upgrades):** Added Rotating Shuriken (stackable to 6, each adds one orbiting shuriken that damages nearby enemies on a 0.5s interval) and Rotating Shield (stackable to 4, each adds an orbiting shield that reduces incoming damage by 12% and damages nearby enemies on a 0.85s interval). Both have pooled orbit visuals and per-target hit timers. Smoke test confirmed caps (6/4) and combined damage (enemy 100→22). Browser verified 6 shuriken and 4 shield meshes orbiting. `npm run build` clean.
- **2026-11-24 — Category 20 (cleanup/health):** Removed the Max HP and Move Speed upgrade cards entirely (smoke test: absent from 200 drafts). Reduced health pickups to 5 initial / 6.5s respawn versus 40 EXP orbs / 2.5s, and shaped them as red 3D hearts with a gentle floating/pulsing animation after a brief orb-style detour. Smoke test confirms fewer health pickups than orbs. Browser verified 5 heart meshes with ExtrudeGeometry. `npm run build` clean.
- **2026-11-24 — Category 21 (health bars/damage):** Replaced the continuous HP meter with segmented bars: 3 at level 0, +2 per level through 10, +1 from 11–20 (23 at 10, 33 at 20). Level-ups now heal the newly added bars; archetype HP bonuses were removed so all characters share the curve. Rebalanced every weapon to 1–2 base damage and scaled hazards, petals, spikes and vampiric healing to the new HP range. HUD renders one segment per bar. Smoke test asserts the curve and all existing behavior suites still pass; browser verified 3 segments at level 0. `npm run build` clean.
- **2026-11-24 — Category 22 (stick aiming):** PC aiming now follows the right joystick direction instead of the mouse cursor; mouse raycast aiming was removed entirely. Arrow keys remain an alternative and the last aim direction is retained when no stick/keys are active. HUD/menu/README hints updated. Browser verified that mouse movement alone no longer changes aim while dragging the right stick left sets aimX to -1. `npm run build` clean.
- **2026-11-24 — Category 23 (cursor):** Added an original procedural SVG cursor theme: a 32px cyan targeting ring with gold crosshair ticks and center dot for the arena/canvas, and a 24px gold diamond with a cyan core for buttons, upgrade cards, unit toggle, joystick bases and the character preview. Removed competing `cursor: pointer` declarations so the themed hover cursor applies. Browser verified computed cursors on body/canvas (32px crosshair) and buttons/cards (24px diamond). `npm run build` clean.
