/* Keep the screen awake while you play (the Screen Wake Lock API: Safari on iPhone since
   iOS 16.4, and in Home Screen web apps since iOS 18.4). The lock is let go whenever the page is
   hidden, so it is asked for again when you come back. A setting turns it off; resting (Leave)
   lets the screen sleep. */
export class Awake {
  on = true;
  private lock: WakeLockSentinel | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.acquire();
    });
  }

  /** Playing: keep the screen on (call from a tap the first time, as iOS prefers). */
  want(): void {
    this.wanted = true;
    void this.acquire();
  }
  /** Resting: the screen may sleep. */
  rest(): void {
    this.wanted = false;
    this.release();
  }
  set(on: boolean): void {
    this.on = on;
    if (on) void this.acquire();
    else this.release();
  }

  private async acquire(): Promise<void> {
    if (!this.on || !this.wanted || this.lock || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      this.lock = lock;
      lock.addEventListener("release", () => {
        if (this.lock === lock) this.lock = null;
      });
    } catch {
      /* not allowed just now (Low Power Mode, or no tap yet): asked again on the next return */
    }
  }
  private release(): void {
    const l = this.lock;
    this.lock = null;
    void l?.release().catch(() => {});
  }
}
