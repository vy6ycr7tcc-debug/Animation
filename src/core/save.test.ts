import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { load, save, clear, SaveData } from "./save";

const KEY = "inward-journey:night:v1";

describe("core/save", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validData: SaveData = {
    v: 1,
    pos: [0, 0, 0],
    heading: 0,
    heard: [],
    visited: [],
    settings: { volume: 1, reduced: false, subtitles: true }
  };

  describe("load()", () => {
    it("returns null when localStorage is empty", () => {
      expect(load()).toBeNull();
    });

    it("returns parsed data when localStorage has valid data", () => {
      localStorage.setItem(KEY, JSON.stringify(validData));
      expect(load()).toEqual(validData);
    });

    it("returns null when localStorage has invalid JSON", () => {
      localStorage.setItem(KEY, "invalid json");
      expect(load()).toBeNull();
    });

    it("returns null when data is missing version or wrong version", () => {
      const dataV2 = { ...validData, v: 2 };
      localStorage.setItem(KEY, JSON.stringify(dataV2));
      expect(load()).toBeNull();

      const { v, ...dataNoV } = validData;
      localStorage.setItem(KEY, JSON.stringify(dataNoV));
      expect(load()).toBeNull();
    });

    it("handles localStorage.getItem throwing an error", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage error");
      });
      expect(load()).toBeNull();
    });
  });

  describe("save()", () => {
    it("writes stringified data to localStorage", () => {
      save(validData);
      const raw = localStorage.getItem(KEY);
      expect(raw).toBeDefined();
      expect(JSON.parse(raw!)).toEqual(validData);
    });

    it("handles localStorage.setItem throwing an error", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage full");
      });
      expect(() => save(validData)).not.toThrow();
      expect(setItemSpy).toHaveBeenCalled();
    });
  });

  describe("clear()", () => {
    it("removes data from localStorage", () => {
      localStorage.setItem(KEY, JSON.stringify(validData));
      clear();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("handles localStorage.removeItem throwing an error", () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("storage error");
      });
      expect(() => clear()).not.toThrow();
      expect(removeItemSpy).toHaveBeenCalled();
    });
  });
});
