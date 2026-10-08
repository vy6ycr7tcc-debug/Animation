/* Offline play (⋮ → Download for offline play). Every file the game uses (public/, listed with a
   hash and size in assets.json by generate-assets.js) is kept in one cache that survives
   updates: a new version of the game downloads only the files that changed, never everything
   again. What is kept is served by the service worker (public/sw.js) first, on line or off, so
   once downloaded the game uses no data for them; and while you play on line, the recordings,
   models and textures you meet are kept as you go (sw.js), so none is fetched twice. */

/** The one cache (shared with public/sw.js: keep the names equal). */
export const OFFLINE_CACHE_NAME = "inward-journey-assets";
/** What each kept file's content was when kept: path → hash. */
const RECORD = "inward-journey:offline";

export interface AssetEntry {
  p: string;
  h: string;
  s: number;
}
export interface DownloadProgress {
  total: number;
  downloaded: number;
  percentage: number;
}
export interface Plan {
  /** Files to fetch: new, or changed since they were kept. */
  need: AssetEntry[];
  bytes: number;
  /** Kept files the game no longer has. */
  stale: string[];
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
  return false;
}

function record(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(RECORD) ?? "{}");
  } catch {
    return {};
  }
}
function saveRecord(r: Record<string, string>): void {
  try {
    localStorage.setItem(RECORD, JSON.stringify(r));
  } catch {
    /* private window */
  }
}
/** Whether offline play was ever downloaded on this device. */
export const downloadedBefore = (): boolean => Object.keys(record()).length > 0;
const url = (p: string) => new URL(`./${p}`, location.href).href;

/** The list of files, from the server, never from a cache (`fresh` lets it past the worker). */
export async function fetchAssetList(): Promise<AssetEntry[]> {
  const res = await fetch(`./assets.json?fresh=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch assets list: ${res.status} ${res.statusText}`);
  const list = (await res.json()) as (AssetEntry | string)[];
  return list.map((e) => (typeof e === "string" ? { p: e, h: "", s: 0 } : e));
}

/** Files kept under the old per-build caches move into the one cache (once), so nothing that was
    downloaded is downloaded again. */
async function migrate(): Promise<void> {
  const old = (await caches.keys()).filter((k) => k.startsWith("inward-journey-assets-"));
  if (!old.length) return;
  const cache = await caches.open(OFFLINE_CACHE_NAME);
  for (const k of old) {
    const c = await caches.open(k);
    for (const req of await c.keys()) {
      const res = await c.match(req);
      if (res && !(await cache.match(req, { ignoreSearch: true }))) await cache.put(req, res);
    }
    await caches.delete(k);
  }
}

/** What a download would fetch now: files missing from the cache, or changed since they were
    kept. A file kept as you played (no record yet) counts as current when its size matches. */
export async function plan(list?: AssetEntry[]): Promise<Plan> {
  await migrate();
  const assets = list ?? (await fetchAssetList());
  const cache = await caches.open(OFFLINE_CACHE_NAME);
  const rec = record();
  const need: AssetEntry[] = [];
  for (const a of assets) {
    const hit = await cache.match(url(a.p), { ignoreSearch: true });
    if (!hit) need.push(a);
    else if (rec[a.p] ? !!a.h && rec[a.p] !== a.h : !!a.s && Number(hit.headers.get("content-length") || a.s) !== a.s) need.push(a);
  }
  const listed = new Set(assets.map((a) => url(a.p)));
  const stale = (await cache.keys()).map((r) => r.url.split("?")[0]).filter((u) => !listed.has(u));
  return { need, bytes: need.reduce((s, a) => s + a.s, 0), stale };
}

/** Downloads what the plan needs (four at a time), records each, and lets go of what is gone. */
export async function downloadAssets(onProgress: (progress: DownloadProgress) => void): Promise<{ failed: number; bytes: number }> {
  const assets = await fetchAssetList();
  const p = await plan(assets);
  const cache = await caches.open(OFFLINE_CACHE_NAME);
  for (const u of p.stale) await cache.delete(u, { ignoreSearch: true });
  const rec = record();
  for (const k of Object.keys(rec)) if (!assets.some((a) => a.p === k)) delete rec[k];
  // what is already current is recorded as it stands
  const needed = new Set(p.need.map((a) => a.p));
  for (const a of assets) if (!needed.has(a.p)) rec[a.p] = a.h;
  saveRecord(rec);
  const total = p.need.reduce((s, a) => s + Math.max(1, a.s), 0);
  let done = 0, count = 0, failed = 0;
  const report = () => onProgress({ total: p.need.length, downloaded: count, percentage: total ? Math.floor((done / total) * 100) : 100 });
  report();
  let i = 0;
  const worker = async () => {
    while (i < p.need.length) {
      const a = p.need[i++];
      try {
        // `fresh` gets past the worker's cache, to the server
        const res = await fetch(`./${a.p}?fresh=${a.h || Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          await cache.put(url(a.p), res);
          rec[a.p] = a.h;
          saveRecord(rec);
        } else failed++;
      } catch {
        failed++;
      }
      done += Math.max(1, a.s);
      count++;
      report();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { failed, bytes: p.bytes };
}

/** On line, once downloaded: the size of the update waiting (null when there is none). */
export async function pendingUpdate(): Promise<number | null> {
  if (!navigator.onLine || !downloadedBefore()) return null;
  try {
    const p = await plan();
    return p.need.length ? p.bytes : null;
  } catch {
    return null;
  }
}

export const megabytes = (b: number): string => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`);
