/* Samuel's phone kept playing an old copy of the game for days (Safari and the Home Screen hold
   on to the page). At the start, and on coming back to the game, ask the server which build is
   current; if it isn't this one, `onNewer` is told. */

const current = (() => {
  try {
    return new URL(import.meta.url).pathname.split("/").pop() ?? "";
  } catch {
    return "";
  }
})();

export async function newerBuild(): Promise<string | null> {
  if (import.meta.env.DEV || !current.startsWith("index-")) return null;
  try {
    // `?fresh=` passes the service worker by (it would answer with its kept page), `no-store` the
    // browser's own cache: this is the server's word
    const page = new URL(".", location.href);
    page.searchParams.set("fresh", String(Date.now()));
    const html = await (await fetch(page, { cache: "no-store" })).text();
    const live = html.match(/assets\/(index-[\w-]+\.js)/)?.[1];
    return live && live !== current ? live : null;
  } catch {
    return null; // offline: play what we have
  }
}

/** Load the newest build: a new address, so no cache can answer with the old page. Once per build. */
export function reloadTo(live: string): boolean {
  const key = "inward-journey:fresh:" + live;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* private mode: still try once */
  }
  const u = new URL(location.href);
  u.searchParams.set("v", live.replace(/^index-|\.js$/g, ""));
  location.replace(u.toString());
  return true;
}
