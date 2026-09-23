import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "@/app/_components/urlBase64ToUint8Array";

describe("urlBase64ToUint8Array", () => {
  it.each([
    ["AQID", [1, 2, 3]],
    ["_-8", [255, 239]], // URL-safe alphabet, unpadded
    ["", []],
  ])("decodes %j", (input, expected) => {
    expect(Array.from(urlBase64ToUint8Array(input))).toEqual(expected);
  });
});
