/* ════════════════════════════════════════════════════════════════════
   BRC-1.1 — coordinate transform & draw-order unit tests
   Run:  node tests/transform.test.mjs
   These are the canonical assertions from the PRD (§2 compass convention,
   §3 deterministic within-layer order). The functions below MIRROR the
   shipped implementation in index.html — keep them in sync. The browser
   artifact runs the same checks live (see runSelfTests / the header
   "compass ✓" badge); this file is the CI-runnable copy.
   ════════════════════════════════════════════════════════════════════ */

const D2R = Math.PI / 180;

/* COMPASS CONVENTION (PRD §2): 0°=12 o'clock, increasing clockwise.
   x = cx + r·cos(θ−90°), y = cy + r·sin(θ−90°). */
function polarToXY(cx, cy, angleDeg, radiusPx) {
  const t = (angleDeg - 90) * D2R;
  return { x: cx + radiusPx * Math.cos(t), y: cy + radiusPx * Math.sin(t) };
}

/* Within-layer order (PRD §3): radius DESC, then angle ASC, then index. */
function withinLayerCmp(x, y) {
  return (y.radiusNorm || 0) - (x.radiusNorm || 0)
    || (x.angleDeg || 0) - (y.angleDeg || 0)
    || x.idx - y.idx;
}

/* mulberry32 — canonical seeded PRNG (must match index.html). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failed = 0;
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
function assert(name, cond) {
  if (cond) { console.log("  ✓ " + name); }
  else { console.error("  ✗ " + name); failed++; }
}

console.log("BRC-1.1 transform tests");

/* — the headline PRD requirement: 90° renders at 3 o'clock — */
const p90 = polarToXY(0, 0, 90, 100);
assert("90° → 3 o'clock (+x, y≈0)", approx(p90.x, 100) && approx(p90.y, 0));

const p0 = polarToXY(0, 0, 0, 100);
assert("0° → 12 o'clock (x≈0, −y)", approx(p0.x, 0) && approx(p0.y, -100));

const p180 = polarToXY(0, 0, 180, 100);
assert("180° → 6 o'clock (x≈0, +y)", approx(p180.x, 0) && approx(p180.y, 100));

const p270 = polarToXY(0, 0, 270, 100);
assert("270° → 9 o'clock (−x, y≈0)", approx(p270.x, -100) && approx(p270.y, 0));

/* — guard against the banned math convention (would put 90° at 12) — */
assert("math-convention NOT in use (90° is not at top)", !approx(p90.y, -100));

/* — clockwise progression: 0→90 moves right and down-to-center — */
assert("clockwise: 45° lands in the upper-right quadrant", (() => {
  const p = polarToXY(0, 0, 45, 100);
  return p.x > 0 && p.y < 0;
})());

/* — deterministic within-layer order — */
const sorted = [
  { radiusNorm: 0.8, angleDeg: 90, idx: 2 },
  { radiusNorm: 0.9, angleDeg: 10, idx: 1 },
  { radiusNorm: 0.8, angleDeg: 40, idx: 0 },
  { radiusNorm: 0.8, angleDeg: 40, idx: 5 },
].sort(withinLayerCmp);
assert("outer radius draws first", sorted[0].radiusNorm === 0.9);
assert("then angle ascending", sorted[1].angleDeg === 40 && sorted[3].angleDeg === 90);
assert("ties broken by index", sorted[1].idx === 0 && sorted[2].idx === 5);

/* — PRNG determinism (pixel-identical repeatability) — */
const a = mulberry32(42), b = mulberry32(42);
assert("same seed → identical stream", a() === b() && a() === b() && a() === b());

if (failed) { console.error("\n" + failed + " test(s) FAILED"); process.exit(1); }
console.log("\nAll transform tests passed.");
