import type { TableProfile } from "@dropboard/engine";

/**
 * What is currently loaded into the in-browser DuckDB table `data`. It survives moving between pages in the app
 * (the DuckDB worker does too), so a project opens straight after it was created. Rows never leave the browser.
 */
export interface LoadedData {
  /** The project these rows belong to, or null while they are not tied to one yet. */
  projectId: string | null;
  fileName: string;
  profile: TableProfile;
  /** Changes every time rows are loaded, so anything computed from the old rows is not reused for the new ones. */
  loadId: string;
}

let loads = 0;
export const newLoadId = () => String(++loads);

let current: LoadedData | null = null;

export const getLoaded = () => current;
export const setLoaded = (data: LoadedData | null) => {
  current = data;
};

/** Names a spec needs that the file does not have. Empty when the file fits the project. */
export function missingColumns(needed: string[], profile: TableProfile): string[] {
  const have = new Set(profile.columns.map((c) => c.name));
  return needed.filter((n) => !have.has(n));
}
