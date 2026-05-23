import { describe, expect, it } from "vitest";

import {
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from "../src/lib/browser-storage";

describe("browser storage helpers", () => {
  it("returns fallback results when window is unavailable", () => {
    expect(getBrowserStorageItem("missing")).toBeNull();
    expect(setBrowserStorageItem("missing", "value")).toBe(false);
    expect(removeBrowserStorageItem("missing")).toBe(false);
  });

  it("does not throw when localStorage operations fail", () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => {
            throw new Error("storage disabled");
          },
          setItem: () => {
            throw new Error("quota exceeded");
          },
          removeItem: () => {
            throw new Error("storage disabled");
          },
        },
      },
    });

    try {
      expect(getBrowserStorageItem("tokenradar")).toBeNull();
      expect(setBrowserStorageItem("tokenradar", "value")).toBe(false);
      expect(removeBrowserStorageItem("tokenradar")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
