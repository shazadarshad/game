/**
 * scenery.js
 *
 * PURE placement math for roadside scenery (trees, grandstands). Imports
 * nothing from Three/Cannon so the placement algorithm can be unit tested
 * offline. Given the track's resampled centerline and CONFIG.scenery, these
 * functions return plain descriptor objects; the impure environment/track
 * builder (game/environment.js or game/track.js) turns each descriptor into
 * Three.js meshes.
 *
 * Determinism: uses a small seeded PRNG (mulberry32) instead of Math.random()
 * so the same centerline + config always produces the same layout, which
 * keeps the tests exact and keeps repeated page loads visually stable.
 */

/** Mulberry32 seeded PRNG returning a function of () => [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Unit tangent at centerline sample `i` (mirrors track.js's tangentAt so
 * offsets/normals agree with the road geometry).
 * @param {{x:number,z:number}[]} pts closed centerline
 * @param {number} i sample index
 * @returns {{x:number,z:number}}
 */
function tangentAt(pts, i) {
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n];
  const next = pts[(i + 1) % n];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Place tree descriptors along both sides of a closed centerline, roughly
 * every `cfg.spacing` metres, skipping a side at random (~35% chance) for a
 * less uniform tree line. Each descriptor carries enough data to build a
 * simple cone-on-cylinder tree mesh with per-tree size/colour variation.
 *
 * @param {{x:number,z:number}[]} centerline resampled closed loop
 * @param {number} roadHalfWidth road half-width (metres); scenery starts
 *   `clearance` metres beyond this
 * @param {object} treeCfg CONFIG.scenery.tree
 * @param {number} clearance CONFIG.scenery.clearance
 * @param {number} [seed]
 * @returns {{x:number, z:number, heading:number, height:number, radius:number,
 *   canopyColor:number}[]}
 */
export function placeTrees(centerline, roadHalfWidth, treeCfg, clearance, seed = 1) {
  const rand = mulberry32(seed);
  const out = [];
  const n = centerline.length;
  if (n === 0) return out;

  const spacing = Math.max(2, treeCfg.spacing ?? 14);
  const baseOffset = roadHalfWidth + clearance + (treeCfg.minOffset ?? 3);
  const maxOffset = roadHalfWidth + clearance + (treeCfg.maxOffset ?? 22);
  const jitter = treeCfg.jitter ?? 6;
  const colors = treeCfg.canopyColors ?? [0x2f6b34];

  // Walk the centerline at roughly `spacing`-metre strides by accumulating
  // distance between consecutive resampled points (which are themselves
  // evenly spaced by track.js, but we do not assume that here).
  let distSinceLast = spacing; // trigger a placement at i = 0
  for (let i = 0; i < n; i++) {
    const p = centerline[i];
    const next = centerline[(i + 1) % n];
    const segLen = Math.hypot(next.x - p.x, next.z - p.z);

    if (distSinceLast >= spacing) {
      distSinceLast = 0;
      const t = tangentAt(centerline, i);
      const nx = -t.z;
      const nz = t.x;
      const heading = Math.atan2(t.x, t.z);

      for (const side of [1, -1]) {
        if (rand() < 0.35) continue; // skip this side sometimes
        const offset = Math.min(
          maxOffset,
          baseOffset + rand() * Math.max(0, maxOffset - baseOffset) + rand() * jitter,
        );
        const alongJitter = (rand() - 0.5) * spacing * 0.5;
        const height =
          (treeCfg.minHeight ?? 4) +
          rand() * ((treeCfg.maxHeight ?? 7.5) - (treeCfg.minHeight ?? 4));
        const radius =
          (treeCfg.minRadius ?? 1.1) +
          rand() * ((treeCfg.maxRadius ?? 1.9) - (treeCfg.minRadius ?? 1.1));
        const canopyColor = colors[Math.floor(rand() * colors.length) % colors.length];

        out.push({
          x: p.x + nx * offset * side + t.x * alongJitter,
          z: p.z + nz * offset * side + t.z * alongJitter,
          heading,
          height,
          radius,
          canopyColor,
        });
      }
    }

    distSinceLast += segLen;
  }

  return out;
}

/**
 * Place grandstand descriptors at `cfg.count` evenly spaced points along the
 * centerline, alternating sides, each offset `cfg.offset` metres beyond the
 * road edge (plus clearance).
 *
 * @param {{x:number,z:number}[]} centerline resampled closed loop
 * @param {number} roadHalfWidth road half-width (metres)
 * @param {object} standCfg CONFIG.scenery.grandstand
 * @param {number} clearance CONFIG.scenery.clearance
 * @returns {{x:number, z:number, heading:number, width:number, depth:number, height:number}[]}
 */
export function placeGrandstands(centerline, roadHalfWidth, standCfg, clearance) {
  const out = [];
  const n = centerline.length;
  if (n === 0) return out;
  const count = Math.max(0, Math.floor(standCfg.count ?? 5));
  const offset = roadHalfWidth + clearance + (standCfg.offset ?? 16);

  for (let k = 0; k < count; k++) {
    const i = Math.floor((k * n) / count) % n;
    const p = centerline[i];
    const t = tangentAt(centerline, i);
    const nx = -t.z;
    const nz = t.x;
    const side = k % 2 === 0 ? 1 : -1;
    // Grandstand faces the track: rotate the local +Z (its "depth" axis) to
    // point back toward the centerline, i.e. heading = the inward normal.
    const heading = Math.atan2(-nx * side, -nz * side);

    out.push({
      x: p.x + nx * offset * side,
      z: p.z + nz * offset * side,
      heading,
      width: standCfg.width ?? 22,
      depth: standCfg.depth ?? 6,
      height: standCfg.height ?? 8,
    });
  }

  return out;
}

export default { placeTrees, placeGrandstands };
