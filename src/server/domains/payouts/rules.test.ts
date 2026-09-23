import { describe, expect, it } from "vitest";
import { isSafeReturnPath } from "./rules";

describe("isSafeReturnPath", () => {
  it.each([
    ["/g/futsal", true],
    ["/g/futsal/events/new?from=x", true],
    ["https://evil.example", false],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["g/futsal", false],
    ["", false],
  ])("%j → %s", (path, expected) => {
    expect(isSafeReturnPath(path)).toBe(expected);
  });
});
