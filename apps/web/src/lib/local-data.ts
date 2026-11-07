import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDb } from "./duckdb";
import { profileTable } from "./ingest";
import type { LoadedData } from "./loaded-data";

/**
 * A copy of each project's parsed table, kept in the browser's private storage (OPFS) as Parquet, so reopening a
 * project does not ask for the file again. It never leaves this device. Everything here is best effort: where the
 * browser cannot do it (older Safari, private windows, storage full) the project simply asks for the file instead.
 *
 * Files are grouped per signed-in user and wiped on sign-out, so a shared computer keeps nothing.
 */

const ROOT = "dropboard-data";

export const localDataSupported = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.storage?.getDirectory === "function";

async function userDir(userId: string, create: boolean) {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ROOT, { create });
  return base.getDirectoryHandle(userId, { create });
}

/** Save the table currently loaded as `data`. Returns whether it worked. */
export async function saveProjectData(
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (!localDataSupported()) return false;
  const db = await getDb();
  const name = `export-${projectId}.parquet`;
  const conn = await db.connect();
  try {
    await conn.query(
      `COPY data TO '${name}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );
    const bytes = await db.copyFileToBuffer(name);
    const dir = await userDir(userId, true);
    const handle = await dir.getFileHandle(`${projectId}.parquet`, {
      create: true,
    });
    const out = await handle.createWritable();
    await out.write(bytes as unknown as BufferSource);
    await out.close();
    return true;
  } catch {
    await removeProjectData(userId, projectId);
    return false;
  } finally {
    await conn.close();
    try {
      await db.dropFile(name);
    } catch {
      /* nothing to drop */
    }
  }
}

export async function hasProjectData(
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (!localDataSupported()) return false;
  try {
    await (await userDir(userId, false)).getFileHandle(`${projectId}.parquet`);
    return true;
  } catch {
    return false;
  }
}

/** Load a saved copy into DuckDB as `data` and profile it, or null when there is none. */
export async function loadProjectData(
  userId: string,
  projectId: string,
  fileName: string,
): Promise<LoadedData | null> {
  if (!localDataSupported()) return null;
  try {
    const file = await (
      await (await userDir(userId, false)).getFileHandle(`${projectId}.parquet`)
    ).getFile();
    const db = await getDb();
    const name = `cache-${projectId}.parquet`;
    await db.registerFileHandle(
      name,
      file,
      DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    );
    const conn = await db.connect();
    try {
      await conn.query(
        `CREATE OR REPLACE TABLE data AS SELECT * FROM read_parquet('${name}')`,
      );
    } finally {
      await conn.close();
    }
    return { projectId, fileName, profile: await profileTable() };
  } catch {
    return null;
  }
}

export async function removeProjectData(
  userId: string,
  projectId: string,
): Promise<void> {
  if (!localDataSupported()) return;
  try {
    await (await userDir(userId, false)).removeEntry(`${projectId}.parquet`);
  } catch {
    /* already gone */
  }
}

/** Remove every saved table, for one user or (without an id) for all of them. Used on sign-out. */
export async function clearLocalData(userId?: string): Promise<void> {
  if (!localDataSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle(ROOT);
    if (userId) await base.removeEntry(userId, { recursive: true });
    else await root.removeEntry(ROOT, { recursive: true });
  } catch {
    /* nothing saved */
  }
}
