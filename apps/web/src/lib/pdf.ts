/**
 * A PDF made of one picture on one page. The page is as wide as an A4 sheet and as tall as the picture needs, so a long story is
 * one page, not cut in pieces. The picture is a JPEG, which a PDF can hold as it is, so this is a few objects and a table of where
 * they are, written by hand: no library needed.
 */
const PAGE_WIDTH = 595; // points: the width of A4
const MAX_HEIGHT = 14_400; // the largest page a PDF reader is guaranteed to open

export function pdfFromJpeg(jpeg: Uint8Array, width: number, height: number, title = "Dropboard"): Uint8Array {
  const natural = (PAGE_WIDTH * height) / width;
  const pageHeight = Math.min(MAX_HEIGHT, Math.round(natural));
  // 1 unless the page had to be cut down to the largest size, in which case the picture is drawn smaller, not stretched
  const scale = pageHeight / natural;
  const drawn = PAGE_WIDTH * scale;
  const text = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const add = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? text.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (number: number, body: string | Uint8Array[]) => {
    offsets[number] = length;
    add(`${number} 0 obj\n`);
    for (const piece of typeof body === "string" ? [body] : body) add(piece);
    add("\nendobj\n");
  };
  const safeTitle = title.replace(/[()\\\r\n]/g, " ").slice(0, 100);
  const content = `q ${drawn.toFixed(2)} 0 0 ${pageHeight} ${((PAGE_WIDTH - drawn) / 2).toFixed(2)} 0 cm /Im0 Do Q`;

  add("%PDF-1.4\n%âãÏÓ\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, [
    text.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    text.encode("\nendstream"),
  ]);
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(6, `<< /Title (${safeTitle}) /Producer (Dropboard) >>`);

  const xref = length;
  add(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("")}`);
  add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
