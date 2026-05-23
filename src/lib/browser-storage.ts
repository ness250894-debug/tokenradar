function getLocalStorage(): Storage | null {
  if (typeof window === "undefined" || !("localStorage" in window)) return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getBrowserStorageItem(key: string): string | null {
  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setBrowserStorageItem(key: string, value: string): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeBrowserStorageItem(key: string): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
