/**
 * Getting a file from a link. A browser cannot fetch most addresses itself (the other site would have to allow it), so the server
 * fetches the file and passes it straight through: it is not stored and not logged. The result is a File, read in the browser
 * like any dropped file.
 */

export class LinkError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const KIND_FOR_TYPE: [RegExp, string][] = [
  [/csv/, "text/csv"],
  [/tab-separated/, "text/tab-separated-values"],
  [/ndjson|jsonl|jsonlines/, "application/x-ndjson"],
  [/json/, "application/json"],
  [/spreadsheetml/, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
];

/** Fetch a file from a CSV or JSON link, or a Google Sheet. Throws a LinkError with a message a person can act on. */
export async function fetchLink(address: string): Promise<File> {
  const url = address.trim();
  if (!url) throw new LinkError("Paste a link first.");
  let response: Response;
  try {
    response = await fetch("/api/import/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
  } catch {
    throw new LinkError("Could not reach Dropboard. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (response.status === 401) throw new LinkError("Sign in again to import from a link.", "unauthorized");
    throw new LinkError(body?.error ?? "Could not fetch that link.", body?.code);
  }
  const type = response.headers.get("content-type") ?? "text/csv";
  const name = decodeURIComponent(response.headers.get("x-import-filename") ?? "Imported data.csv");
  const mime = KIND_FOR_TYPE.find(([pattern]) => pattern.test(type))?.[1] ?? type;
  return new File([await response.blob()], name, { type: mime });
}
