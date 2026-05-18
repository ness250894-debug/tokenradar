function describeFetchTarget(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const blockedFetch: typeof fetch = async (input) => {
  throw new Error(
    `Unexpected unmocked fetch call in Vitest: ${describeFetchTarget(input)}. ` +
      "Mock globalThis.fetch with vi.stubGlobal() or vi.spyOn() in the test.",
  );
};

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: blockedFetch,
});
