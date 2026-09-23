import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./rules";

describe("slugify", () => {
  it("lowercases and dasherizes", () => {
    expect(slugify("Thursday Basketball Galway")).toBe("thursday-basketball-galway");
  });

  it("strips leading/trailing punctuation", () => {
    expect(slugify("  -- Cool Group! --  ")).toBe("cool-group");
  });
});

describe("isValidSlug", () => {
  it("accepts a well-formed slug", () => {
    expect(isValidSlug("thursday-basketball")).toBe(true);
  });

  it("rejects uppercase, spaces, or leading/trailing dashes", () => {
    expect(isValidSlug("Thursday Basketball")).toBe(false);
    expect(isValidSlug("-leading-dash")).toBe(false);
    expect(isValidSlug("ab")).toBe(false);
  });
});
