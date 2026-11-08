/** A file name from a chart title: letters and digits joined by hyphens, never empty. */
export function imageName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "chart"}.png`;
}
