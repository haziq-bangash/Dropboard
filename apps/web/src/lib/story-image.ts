/**
 * The Story as one tall picture, to share or print: the headline with its yellow block, the tags, the key figures on their shapes,
 * the lead sentence and the chapters, in the same colours and type as the page. It is drawn here, in the browser, on a canvas from
 * the text already on the page (so a story Pilot has written is saved as it reads), and nothing is uploaded.
 */

export interface StoryImage {
  headline: string;
  /** The word the italic part of the headline starts at. */
  italicFrom: number;
  subline: string;
  tags: string[];
  figures: { value: string; label: string; headline: string }[];
  lead: string;
  chapters: { headline: string; sentence: string }[];
  footer: string;
}

export interface StoryFonts {
  serif: string;
  sans: string;
}

const WIDTH = 1080;
const PAD = 72;
const INNER = WIDTH - PAD * 2;
const SCALE = 2;
const INK = "#233038";
const MUTED = "#5C6B73";
const PAPER = "#FDF6E3";
const YELLOW = "#F4D47C";
const MINT = "#CFE8E1";
const PEACH = "#FFD59A";
const ORANGE = "#EE5400";

type Ctx = CanvasRenderingContext2D;

/** Break text into lines no wider than `max`, at spaces. A single word wider than the line stays on its own line. */
function wrap(ctx: Ctx, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Lay the whole story out from the top, drawing when `paint` is true, and say how tall it came to. */
function layout(ctx: Ctx, s: StoryImage, f: StoryFonts, paint: boolean): number {
  const serif = (size: number, italic = false) => `${italic ? "italic " : ""}${size}px ${f.serif}`;
  const sans = (size: number, weight = 400) => `${weight} ${size}px ${f.sans}`;
  ctx.textBaseline = "alphabetic";
  let y = 96;

  // the headline: words in turn, the last third in italic, wrapped to the width
  ctx.font = serif(88);
  const words = s.headline.split(/\s+/).filter(Boolean).map((text, i) => ({ text, italic: i >= s.italicFrom }));
  const rows: { text: string; italic: boolean }[][] = [[]];
  let rowWidth = 0;
  const space = ctx.measureText(" ").width;
  for (const w of words) {
    ctx.font = serif(88, w.italic);
    const width = ctx.measureText(w.text).width;
    if (rowWidth > 0 && rowWidth + space + width > INNER) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push(w);
    rowWidth += (rowWidth ? space : 0) + width;
  }
  const lineHeight = 92;
  if (paint) {
    ctx.fillStyle = YELLOW;
    ctx.fillRect(PAD - 24, y - 40, 96, Math.min(rows.length * lineHeight, 200));
  }
  for (const row of rows) {
    y += lineHeight - 12;
    if (paint) {
      let x = PAD;
      ctx.fillStyle = INK;
      for (const w of row) {
        ctx.font = serif(88, w.italic);
        ctx.fillText(w.text, x, y);
        x += ctx.measureText(w.text).width + space;
      }
    }
    y += 12;
  }

  y += 44;
  ctx.font = sans(24);
  if (paint) {
    ctx.fillStyle = MUTED;
    ctx.fillText(s.subline, PAD, y);
  }

  // tags as outlined pills
  y += 32;
  let x = PAD;
  ctx.font = sans(22);
  for (const tag of s.tags) {
    const w = ctx.measureText(tag).width + 36;
    if (x + w > WIDTH - PAD) {
      x = PAD;
      y += 52;
    }
    if (paint) {
      roundRect(ctx, x, y, w, 40, 20, 20, 20, 20);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(tag, x + 18, y + 27);
    }
    x += w + 12;
  }
  y += 40 + 64;

  // the key figures, each on its own shape
  const shapes: [string, number, number, number, number][] = [
    [YELLOW, 24, 24, 24, 24],
    [MINT, 96, 96, 24, 24],
    [PEACH, 24, 24, 24, 24],
  ];
  const n = Math.max(1, Math.min(3, s.figures.length));
  const gap = 24;
  const cardWidth = (INNER - gap * (n - 1)) / n;
  let cardHeight = 0;
  const prepared = s.figures.slice(0, 3).map((fig) => {
    let size = 76;
    ctx.font = serif(size);
    while (size > 36 && ctx.measureText(fig.value).width > cardWidth - 48) {
      size -= 4;
      ctx.font = serif(size);
    }
    ctx.font = sans(20);
    const label = wrap(ctx, fig.label, cardWidth - 48);
    ctx.font = sans(22, 600);
    const head = wrap(ctx, fig.headline, cardWidth - 48);
    cardHeight = Math.max(cardHeight, 48 + size + label.length * 26 + 20 + head.length * 28 + 32);
    return { fig, size, label, head };
  });
  cardHeight = Math.max(cardHeight, 260);
  prepared.forEach((p, i) => {
    const left = PAD + i * (cardWidth + gap);
    if (paint) {
      const [fill, tl, tr, br, bl] = shapes[i % shapes.length];
      roundRect(ctx, left, y, cardWidth, cardHeight, tl, tr, br, bl);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    let cy = y + cardHeight - 32 - p.head.length * 28 - 20 - p.label.length * 26 - 12;
    if (paint) {
      ctx.fillStyle = INK;
      ctx.font = serif(p.size);
      ctx.fillText(p.fig.value, left + 24, cy);
    }
    cy += 34;
    ctx.font = sans(20);
    for (const line of p.label) {
      if (paint) {
        ctx.fillStyle = MUTED;
        ctx.fillText(line, left + 24, cy);
      }
      cy += 26;
    }
    cy += 14;
    ctx.font = sans(22, 600);
    for (const line of p.head) {
      if (paint) {
        ctx.fillStyle = INK;
        ctx.fillText(line, left + 24, cy);
      }
      cy += 28;
    }
  });
  y += cardHeight + 72;

  // the lead sentence, large
  ctx.font = serif(42);
  for (const line of wrap(ctx, s.lead, INNER - 40)) {
    if (paint) {
      ctx.fillStyle = INK;
      ctx.fillText(line, PAD + 40, y);
    }
    y += 54;
  }
  y += 36;

  // the chapters, numbered, each under a thin line
  s.chapters.forEach((c, i) => {
    if (paint) {
      ctx.strokeStyle = "rgba(35,48,56,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(WIDTH - PAD, y);
      ctx.stroke();
    }
    y += 64;
    if (paint) {
      ctx.fillStyle = ORANGE;
      ctx.font = serif(64);
      ctx.fillText(String(i + 2).padStart(2, "0"), PAD, y);
    }
    const textX = PAD + 120;
    const textWidth = WIDTH - PAD - textX;
    ctx.font = serif(38);
    let cy = y - 18;
    for (const line of wrap(ctx, c.headline, textWidth)) {
      if (paint) {
        ctx.fillStyle = INK;
        ctx.fillText(line, textX, cy);
      }
      cy += 46;
    }
    cy += 4;
    ctx.font = sans(24);
    for (const line of wrap(ctx, c.sentence, textWidth)) {
      if (paint) {
        ctx.fillStyle = INK;
        ctx.fillText(line, textX, cy);
      }
      cy += 34;
    }
    y = Math.max(y, cy) + 32;
  });

  // the footer
  y += 8;
  ctx.font = sans(20);
  for (const line of wrap(ctx, s.footer, INNER)) {
    if (paint) {
      ctx.fillStyle = MUTED;
      ctx.fillText(line, PAD, y);
    }
    y += 28;
  }
  return y + 56;
}

/** Draw the story and return it as a PNG. Fonts are waited for first, so the picture uses the page's own type and not a fallback. */
export async function renderStoryImage(story: StoryImage, fonts: StoryFonts): Promise<Blob> {
  // a font that cannot be loaded must not stop the picture: after a few seconds the fallback type is used
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([wait(4000), Promise.all([document.fonts.load(`88px ${fonts.serif}`), document.fonts.load(`italic 88px ${fonts.serif}`), document.fonts.load(`24px ${fonts.sans}`), document.fonts.load(`600 22px ${fonts.sans}`)]).catch(() => undefined)]);
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("This browser cannot draw the picture.");
  const height = Math.ceil(layout(measure, story, fonts, false));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the picture.");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, height);
  layout(ctx, story, fonts, true);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be saved."))), "image/png"));
}
