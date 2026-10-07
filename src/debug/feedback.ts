/* The owner's feedback tool (dev mode only, `?dev=1`; loaded on demand, so with dev mode off none
   of this exists). A small button (or the backtick key) holds the game where it is, takes the
   picture of the world as it stands, and shows it back with a field for what is seen and the
   place, view, tour, voice and build it was seen in. Send gives the picture and a note (.png and
   .md, the note also on the clipboard, ready to paste to the builder); Discard lets it go. Either
   way the game goes on from the same moment. Nothing leaves the device. */

export interface FeedbackHost {
  /** Draws one fresh frame and copies the world's picture (the canvas only: never the controls). */
  capture(): HTMLCanvasElement | null;
  /** What was on screen: label → value, in order. */
  context(): [string, string][];
  /** Holds the game (the frame, the voice, a tour's advance); the returned call lets it go on. */
  hold(): () => void;
}

const CSS = `
#fb-btn {
  position: fixed; right: calc(34px + env(safe-area-inset-right, 0px)); bottom: calc(108px + env(safe-area-inset-bottom, 0px));
  z-index: 40; width: 40px; height: 40px; border-radius: 50%; padding: 0; opacity: 0.4;
  border: 1px solid rgba(244, 239, 230, 0.35); background: rgba(14, 12, 34, 0.35);
  color: var(--pearl, #f4efe6); font: 17px/1 Georgia, serif; display: grid; place-items: center;
  touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
#fb-btn:active { opacity: 0.8; border-color: var(--gold, #e2bf7e); }
body.recording #fb-btn, body.fb-open #fb-btn { display: none; }
#fb {
  position: fixed; inset: 0; height: var(--fh, 100lvh); z-index: 120; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: rgba(3, 4, 10, 0.86); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  animation: fb-rise 0.45s cubic-bezier(0.2, 0.6, 0.3, 1);
}
@keyframes fb-rise { from { opacity: 0; } to { opacity: 1; } }
#fb[hidden] { display: none; }
#fb .fb-card {
  width: min(100%, 34em); margin: 0 auto; padding: 14px 16px 12px; box-sizing: border-box; border-radius: 18px;
  background: var(--panel, rgba(14, 12, 34, 0.84)); border: 1px solid var(--line, rgba(226, 191, 126, 0.28));
}
#fb h2 { margin: 0 0 10px; font: italic 17px/1.3 Georgia, serif; color: var(--gold, #e2bf7e); font-weight: normal; }
#fb img {
  display: block; width: auto; max-width: 100%; height: auto; max-height: 46vh; margin: 0 auto; border-radius: 10px;
  border: 1px solid var(--line, rgba(226, 191, 126, 0.28));
}
#fb label { display: block; margin: 12px 0 4px; font: italic 14px Georgia, serif; color: var(--pearl, #f4efe6); }
#fb textarea {
  display: block; width: 100%; min-height: 5.5em; box-sizing: border-box; resize: vertical; padding: 10px 12px; border-radius: 12px;
  background: rgba(3, 4, 10, 0.55); border: 1px solid var(--line, rgba(226, 191, 126, 0.28)); color: var(--pearl, #f4efe6);
  font: 16px/1.45 Georgia, serif; -webkit-user-select: text; user-select: text;
}
#fb textarea:focus-visible { outline: 1px solid var(--gold, #e2bf7e); }
#fb .fb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 2px; padding: 0; list-style: none; }
#fb .fb-chips li {
  max-width: 100%; box-sizing: border-box; padding: 4px 10px; border-radius: 14px; overflow-wrap: anywhere;
  border: 1px solid rgba(244, 239, 230, 0.16); background: rgba(244, 239, 230, 0.05);
  font: 12px/1.4 ui-monospace, Menlo, monospace; color: rgba(244, 239, 230, 0.72);
}
#fb .fb-chips b { font-weight: normal; color: var(--gold, #e2bf7e); }
#fb .fb-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
#fb .fb-row button { min-height: 44px; padding: 8px 22px; border-radius: 22px; font: italic 15px Georgia, serif; }
#fb .fb-send { border: 1px solid var(--gold, #e2bf7e); color: var(--gold, #e2bf7e); background: rgba(226, 191, 126, 0.08); }
#fb .fb-send:disabled { opacity: 0.45; }
#fb .fb-discard { border: 1px solid rgba(244, 239, 230, 0.2); color: rgba(244, 239, 230, 0.7); background: none; }
#fb .fb-note { margin: 8px 0 0; min-height: 1.2em; font: italic 13px Georgia, serif; color: rgba(244, 239, 230, 0.6); text-align: right; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), props);

/** Local time, safe in a file name: 2026-10-07T14-03-22. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function installFeedback(host: FeedbackHost): void {
  document.head.append(el("style", { textContent: CSS }));

  const btn = el("button", { id: "fb-btn", type: "button", textContent: "✎" });
  btn.setAttribute("aria-label", "Feedback: capture this view (`)");
  document.body.append(btn);

  const root = el("div", { id: "fb", hidden: true });
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Feedback");
  const card = el("div", { className: "fb-card" });
  const title = el("h2", { textContent: "Feedback" });
  const img = el("img", { alt: "The view as it was" });
  const label = el("label", { htmlFor: "fb-text", textContent: "What do you see?" });
  const text = el("textarea", { id: "fb-text", rows: 4 });
  text.setAttribute("autocapitalize", "sentences");
  const chips = el("ul", { className: "fb-chips" });
  chips.setAttribute("aria-label", "Captured with it");
  const row = el("div", { className: "fb-row" });
  const discard = el("button", { type: "button", className: "fb-discard", textContent: "Discard" });
  const send = el("button", { type: "button", className: "fb-send", textContent: "Send" });
  const note = el("p", { className: "fb-note" });
  note.setAttribute("role", "status");
  row.append(discard, send);
  card.append(title, img, label, text, chips, row, note);
  root.append(card);
  document.body.append(root);

  // the game never hears what happens in here: keys typed (H would wake genesis, WASD walk) and
  // touches (the stick, look, tap to walk) stay in the panel
  for (const ev of ["keydown", "keyup", "keypress"] as const) root.addEventListener(ev, (e) => {
    if (ev === "keydown" && (e as KeyboardEvent).key === "Escape") close();
    e.stopPropagation();
  });
  for (const ev of ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "wheel", "click", "contextmenu"] as const)
    root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  let open = false;
  let png: Blob | null = null;
  let imgUrl = "";
  let when = new Date();
  let ctx: [string, string][] = [];
  let release: (() => void) | null = null;

  function start(): void {
    if (open) return;
    // the picture first, from the frame drawn now (before anything moves on or the panel shows)
    const shot = host.capture();
    release = host.hold();
    open = true;
    when = new Date();
    ctx = host.context();
    ctx.push(["time", when.toISOString()]);
    png = null;
    send.disabled = true;
    note.textContent = shot ? "" : "The picture could not be taken.";
    text.value = "";
    chips.replaceChildren(
      ...ctx.map(([k, v]) => {
        const li = el("li");
        li.append(el("b", { textContent: k + " " }), document.createTextNode(v));
        return li;
      }),
    );
    img.removeAttribute("src");
    if (shot) {
      shot.toBlob((b) => {
        if (!open) return;
        png = b;
        if (b) {
          imgUrl = URL.createObjectURL(b);
          img.src = imgUrl;
        } else note.textContent = "The picture could not be taken.";
        send.disabled = false;
      }, "image/png");
    } else send.disabled = false;
    root.hidden = false;
    document.body.classList.add("fb-open");
    // the keyboard comes up on a phone only when the field is touched (it would cover the picture)
    if (!matchMedia("(pointer: coarse)").matches) text.focus({ preventScroll: true });
  }

  function close(): void {
    if (!open) return;
    open = false;
    root.hidden = true;
    document.body.classList.remove("fb-open");
    text.blur();
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = "";
    png = null;
    const r = release;
    release = null;
    r?.();
  }

  function markdown(base: string): string {
    const said = text.value.trim() || "(no words)";
    return [
      `## Feedback · ${when.toLocaleString()}`,
      "",
      said,
      "",
      ...(png ? [`![screenshot](${base}.png)`, ""] : []),
      ...ctx.map(([k, v]) => `- **${k}:** ${v}`),
      "",
    ].join("\n");
  }

  send.addEventListener("click", () => {
    const base = `${stamp(when)}-feedback`;
    const md = markdown(base);
    // the clipboard first, while the tap still counts as the owner's own gesture
    const copied = navigator.clipboard?.writeText(md).then(() => true, () => false) ?? Promise.resolve(false);
    if (png) download(png, base + ".png");
    // a moment apart: Safari asks before each download and can drop a second one asked at once
    const mdBlob = new Blob([md], { type: "text/markdown" });
    window.setTimeout(() => download(mdBlob, base + ".md"), 450);
    void copied.then((ok) => {
      if (!ok) console.info(md);
    });
    window.setTimeout(close, 600);
  });
  discard.addEventListener("click", close);

  btn.addEventListener("pointerdown", (e) => (e.preventDefault(), e.stopPropagation()));
  btn.addEventListener("click", (e) => (e.stopPropagation(), start()));
  addEventListener("keydown", (e) => {
    if (e.key !== "`" || e.repeat || open) return;
    if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    start();
  });
}
