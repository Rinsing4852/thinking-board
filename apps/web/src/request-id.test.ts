import { afterEach, expect, it, vi } from "vitest";
import { createRequestId } from "./request-id";

afterEach(() => vi.unstubAllGlobals());

it("generates distinct server-safe retry IDs", () => {
  const first = createRequestId();
  expect(first).toMatch(/^[a-f0-9]{32}$/);
  expect(createRequestId()).not.toBe(first);
});

it("does not depend on secure-context-only randomUUID", () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => { bytes.fill(7); return bytes; } });
  expect(createRequestId()).toBe("07".repeat(16));
});
