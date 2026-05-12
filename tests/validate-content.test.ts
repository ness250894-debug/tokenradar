import { describe, expect, it } from "vitest";

import { findUnapprovedOutboundUrls } from "../scripts/validate-content";

describe("content outbound URL validation", () => {
  it("allows approved HTTPS hosts", () => {
    const blocked = findUnapprovedOutboundUrls(
      "Review the source at https://github.com/tokenradar/example.",
      new Set(["github.com"]),
    );

    expect(blocked).toEqual([]);
  });

  it("blocks unknown or non-HTTPS external URLs", () => {
    const blocked = findUnapprovedOutboundUrls(
      "Bad links: https://spam.example/path. Also http://github.com/tokenradar/example",
      new Set(["github.com"]),
    );

    expect(blocked).toEqual([
      "https://spam.example/path",
      "http://github.com/tokenradar/example",
    ]);
  });
});
