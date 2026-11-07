// Generates the decorative SVG art in public/art from seeded noise, in the brand palette.
// Run with: pnpm --filter @dropboard/web art
// The output is committed, so builds do not need this script or d3-contour.
import { contours } from "d3-contour";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "art");
mkdirSync(OUT, { recursive: true });

// ---- seeded value noise -------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const N = 256;
  const grid = Float32Array.from({ length: N * N }, () => rnd());
  const smooth = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => grid[(y & 255) * N + (x & 255)];
  const value = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // fractal noise in [0, 1]
  return (x, y, octaves = 4) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

// ---- color helpers ------------------------------------------------------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
function ramp(stops, t) {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const a = hex(stops[i]);
  const b = hex(stops[i + 1]);
  return toHex(a.map((c, k) => c + (b[k] - c) * f));
}
const darken = (color, f) => toHex(hex(color).map((c) => c * f));

// ---- contour maps -------------------------------------------------------------------------------------------------
function blur(values, W, H, radius, passes) {
  let src = values;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float64Array(src.length);
    const out = new Float64Array(src.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < W) { sum += src[y * W + xx]; n++; }
        }
        tmp[y * W + x] = sum / n;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < H) { sum += tmp[yy * W + x]; n++; }
        }
        out[y * W + x] = sum / n;
      }
    }
    src = out;
  }
  return src;
}

function field(seed, W, H, scale, octaves = 3) {
  const noise = makeNoise(seed);
  const values = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const ny = y / H;
      // domain warp gives the flowing, hand-drawn look of real terrain
      const wx = noise(nx * 2 + 5.2, ny * 2 + 1.3, 3) * 1.4;
      const wy = noise(nx * 2 + 9.7, ny * 2 + 4.1, 3) * 1.4;
      values[y * W + x] = noise(nx * scale + wx, ny * scale * 0.8 + wy, octaves);
    }
  }
  return blur(values, W, H, 2, 2);
}

function pathOf(multiPolygon) {
  const f = (n) => Math.round(n * 10) / 10;
  return multiPolygon.coordinates
    .map((polygon) => polygon.map((ring) => "M" + ring.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z").join(""))
    .join("");
}

function levels(values, count) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return Array.from({ length: count }, (_, i) => min + ((i + 1) / (count + 1)) * (max - min));
}

/** Filled terrain bands, like a geological map. */
function filledTopo({ seed, W, H, count, stops }) {
  const values = field(seed, W, H, 2.6, 3);
  const generator = contours().size([W, H]).thresholds(levels(values, count));
  const bands = generator(values);
  const base = ramp(stops, 0);
  const paths = bands
    .map((band, i) => {
      const fill = ramp(stops, (i + 1) / bands.length);
      return `<path d="${pathOf(band)}" fill="${fill}" stroke="${darken(fill, 0.78)}" stroke-width="0.16" stroke-linejoin="round" fill-rule="evenodd"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="${base}"/>${paths}</svg>`;
}

/** Thin contour lines only, for subtle backgrounds. */
function lineTopo({ seed, W, H, count, stroke, width }) {
  const values = field(seed, W, H, 2.2, 3);
  const generator = contours().size([W, H]).thresholds(levels(values, count));
  const d = generator(values).map(pathOf).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/></svg>`;
}

// ---- footer hills -------------------------------------------------------------------------------------------------
function ridge(seed, { base, amp, freq }) {
  const noise = makeNoise(seed);
  const pts = [];
  for (let x = 0; x <= 1440; x += 6) {
    // 1D slice of the 2D noise, softened so the hills stay rounded
    const n = (noise(x * freq, 3.7, 2) - 0.5) * 3.2;
    pts.push([x, base + amp * n]);
  }
  return pts;
}

function hills() {
  const layers = [
    { seed: 11, base: 110, amp: 120, freq: 0.0014, from: "#3E8E94", to: "#075056", opacity: 0.92 },
    { seed: 23, base: 180, amp: 100, freq: 0.0017, from: "#F4D47C", to: "#E9A53B", opacity: 1 },
    { seed: 37, base: 245, amp: 85, freq: 0.002, from: "#FF8A3D", to: "#FF5B04", opacity: 1 },
    { seed: 53, base: 312, amp: 55, freq: 0.0024, from: "#D9480A", to: "#233038", opacity: 1 },
  ];
  const defs = layers
    .map(
      (l, i) =>
        `<linearGradient id="h${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.from}"/><stop offset="1" stop-color="${l.to}"/></linearGradient>`,
    )
    .join("");
  const paths = layers
    .map((l, i) => {
      const pts = ridge(l.seed, l);
      const top = pts.map(([x, y]) => `${x} ${Math.round(y * 10) / 10}`).join("L");
      return `<path d="M${top}L1440 360L0 360Z" fill="url(#h${i})" opacity="${l.opacity}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 360" preserveAspectRatio="none"><defs>${defs}</defs>${paths}</svg>`;
}

// ---- write --------------------------------------------------------------------------------------------------------
const files = {
  // sign-in panel: sand and orange terrain with teal edges
  "topo-orange.svg": filledTopo({
    seed: 7,
    W: 150,
    H: 190,
    count: 38,
    stops: ["#9DB8B2", "#E9DFB5", "#F4D47C", "#FFB05A", "#FF5B04", "#D9480A", "#8F2B00"],
  }),
  // faint lines for light and dark backgrounds
  "topo-lines-dark.svg": lineTopo({ seed: 19, W: 220, H: 120, count: 22, stroke: "#075056", width: 0.22 }),
  "topo-lines-light.svg": lineTopo({ seed: 19, W: 220, H: 120, count: 22, stroke: "#FDF6E3", width: 0.22 }),
  "footer-hills.svg": hills(),
};

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`${name}  ${(svg.length / 1024).toFixed(0)} KB`);
}
