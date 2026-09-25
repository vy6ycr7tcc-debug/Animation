/* Input: keyboard + mouse on desktop; a thumb joystick (left half) and look-drag
   (right half) on touch, plus one context button. */

export class Input {
  move = { x: 0, y: 0 };
  glide = false;
  /** Accumulated look deltas in pixels since last read. */
  lookX = 0;
  lookY = 0;
  zoom = 1;
  onAction: (() => void) | null = null;
  /** Space or the round button is being held (for gliding). */
  get hold(): boolean {
    return this.enabled && (this.keys.has(" ") || this.actHeld);
  }
  private actHeld = false;
  /** A short tap or click without dragging: walk there. */
  onTap: ((x: number, y: number) => void) | null = null;
  private downAt = new Map<number, { x: number; y: number; t: number }>();
  touchUsed = false;
  enabled = false;

  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private mouseDown = false;
  private pinch: { a: number; b: number; d: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private surface: HTMLElement,
    private joyEl: HTMLElement,
    private knobEl: HTMLElement,
    actionBtn: HTMLElement,
  ) {
    addEventListener("keydown", (e) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.("#menu")) return;
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if ((k === " " || k === "e") && !e.repeat) this.onAction?.();
      this.keys.add(k);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => this.keys.clear());

    surface.addEventListener("pointerdown", (e) => this.down(e));
    surface.addEventListener("pointermove", (e) => this.moveP(e));
    surface.addEventListener("pointerup", (e) => this.up(e));
    surface.addEventListener("pointercancel", (e) => this.up(e));
    surface.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom *= Math.exp(e.deltaY * 0.001);
    }, { passive: false });

    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) actionBtn.addEventListener(ev, () => (this.actHeld = false));
    actionBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.actHeld = true;
      if (this.enabled) this.onAction?.();
    });
    actionBtn.addEventListener("click", (e) => {
      // Keyboard activation of the button (pointer taps were handled on pointerdown).
      if (e.detail === 0 && this.enabled) this.onAction?.();
    });
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.downAt.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    this.surface.setPointerCapture?.(e.pointerId);
    if (e.pointerType === "touch") {
      this.touchUsed = true;
      if (this.pointers.size === 2 && this.joyId === null) {
        const [a, b] = [...this.pointers.keys()];
        this.pinch = { a, b, d: this.pinchDist() };
        this.lookId = null;
        return;
      }
      if (e.clientX < innerWidth * 0.45 && this.joyId === null) {
        this.joyId = e.pointerId;
        this.joyOrigin = { x: e.clientX, y: e.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyEl.style.left = `${e.clientX}px`;
        this.joyEl.style.top = `${e.clientY}px`;
        this.knobEl.style.transform = "translate(-50%,-50%)";
        this.joyEl.hidden = false;
        return;
      }
      if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    } else {
      this.mouseDown = true;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private pinchDist(): number {
    const p = [...this.pointers.values()];
    return p.length < 2 ? 1 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  private moveP(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      const d = this.pinchDist();
      this.zoom *= this.pinch.d / Math.max(1, d);
      this.pinch.d = d;
      return;
    }
    if (e.pointerId === this.joyId) {
      const R = 56;
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      this.joyVec = { x: dx / R, y: -dy / R };
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      return;
    }
    if (e.pointerId === this.lookId || (e.pointerType !== "touch" && this.mouseDown)) {
      this.lookX += e.clientX - this.lookLast.x;
      this.lookY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent): void {
    const d = this.downAt.get(e.pointerId);
    this.downAt.delete(e.pointerId);
    if (d && this.enabled && !this.pinch && e.type === "pointerup" && this.pointers.size <= 1 &&
        Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && performance.now() - d.t < 350) {
      this.onTap?.(e.clientX, e.clientY);
    }
    this.pointers.delete(e.pointerId);
    if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) this.pinch = null;
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyEl.hidden = true;
    }
    if (e.pointerId === this.lookId) this.lookId = null;
    if (e.pointerType !== "touch") this.mouseDown = false;
  }

  /** Resolve the current movement intent. Call once per frame. */
  poll(): void {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has("w") || k.has("arrowup")) y += 1;
    if (k.has("s") || k.has("arrowdown")) y -= 1;
    if (k.has("d") || k.has("arrowright")) x += 1;
    if (k.has("a") || k.has("arrowleft")) x -= 1;
    const kb = x !== 0 || y !== 0;
    if (kb) {
      const l = Math.hypot(x, y);
      this.move = { x: x / l, y: y / l };
      this.glide = k.has("shift");
    } else {
      this.move = { ...this.joyVec };
      // Pushing the thumb to the edge becomes a glide.
      this.glide = Math.hypot(this.joyVec.x, this.joyVec.y) > 0.92;
    }
    if (!this.enabled) {
      this.move = { x: 0, y: 0 };
      this.glide = false;
    }
  }

  takeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = this.lookY = 0;
    return r;
  }
  takeZoom(): number {
    const z = this.zoom;
    this.zoom = 1;
    return z;
  }
}
