/* The phone's keyboard. iOS doesn't shrink the page when its keyboard comes up: it shrinks only
   the visual viewport, so anything held to the foot of the screen sits behind the keyboard and you
   can't see what you type. While a text field is focused and the keyboard is up, the root carries
   `typing` and the visible area as --vvt (its top) and --vvh (its height), in the coordinates
   `position: fixed` uses; panels with fields pin themselves to that area in CSS. */
export function watchKeyboard(): void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const isField = (el: Element | null) =>
    !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(button|checkbox|radio|range|submit|file)$/.test((el as HTMLInputElement).type)));
  const update = () => {
    const field = isField(document.activeElement);
    const top = vv ? vv.offsetTop : 0;
    const h = vv ? vv.height : innerHeight;
    root.style.setProperty("--vvt", `${Math.round(top)}px`);
    root.style.setProperty("--vvh", `${Math.round(h)}px`);
    // the keyboard is up when the visible area is well short of the screen (--fh, the screen's
    // own height as the game measured it: on the Home Screen the window itself may shrink too)
    const full = Math.max(innerHeight, root.clientHeight, parseFloat(root.style.getPropertyValue("--fh")) || 0);
    const up = field && full - h > 80;
    document.body.classList.toggle("typing", up);
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  // iOS raises the keyboard after the focus, and lowers it after the blur: look again as it moves
  const soon = () => {
    update();
    for (const ms of [120, 300, 600]) setTimeout(update, ms);
  };
  addEventListener("focusin", soon);
  addEventListener("focusout", soon);
  update();
}
