// Cuts short GIF loops from out/demo.mp4 at the scene times saved by record.mjs, each under Product Hunt's 3 MB limit.
//   node marketing/producthunt/gifs.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const scenes = JSON.parse(readFileSync(path.join(OUT, "scenes.json"), "utf8"));
mkdirSync(path.join(OUT, "gifs"), { recursive: true });
const LIMIT = 2.9 * 1024 * 1024;

// name, scene to start at, seconds in, length
const clips = [
  ["dashboard", "dashboard", 1.6, 6.5],
  ["insights-and-story", "insights", 0, 12],
  ["ask-pilot", "ask", 0, 12],
];

for (const [name, scene, offset, length] of clips) {
  const start = scenes[scene] + offset;
  const file = path.join(OUT, "gifs", `${name}.gif`);
  let ok = false;
  for (const [width, fps] of [[960, 12], [880, 10], [800, 10], [720, 9], [640, 8]]) {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-ss", String(start), "-t", String(length), "-i", path.join(OUT, "demo.mp4"), "-filter_complex", `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, "-loop", "0", file],
      { stdio: "inherit" },
    );
    const size = statSync(file).size;
    console.log(`${name}: ${width}px, ${fps} fps, ${(size / 1024 / 1024).toFixed(2)} MB`);
    if (size <= LIMIT) {
      ok = true;
      break;
    }
  }
  if (!ok) console.log(`${name}: could not get under the limit`);
}
