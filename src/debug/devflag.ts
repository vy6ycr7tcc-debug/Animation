/* Dev mode for the owner's feedback tool: `?dev=1` turns it on and remembers it on the device
   (it survives reloads), `?dev=0` turns it off. Nothing else of the tool loads while it is off. */
const KEY = "inward-journey:dev";

export function devMode(): boolean {
  const q = new URLSearchParams(location.search).get("dev");
  try {
    if (q === "1") localStorage.setItem(KEY, "1");
    else if (q === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return q === "1"; // storage refused (a private window): this visit only
  }
}
