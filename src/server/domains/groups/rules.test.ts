import { describe, expect, it } from "vitest";
import { canLeaveGroup, inviteExpiresAt, inviteLinkStatus, inviteState, isValidSlug, memberRowActions, slugify } from "./rules";

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

describe("inviteExpiresAt", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it.each([
    ["never", null],
    ["24h", "2026-09-25T12:00:00.000Z"],
    ["7d", "2026-10-01T12:00:00.000Z"],
    ["30d", "2026-10-24T12:00:00.000Z"],
  ] as const)("%s → %s", (choice, expected) => {
    expect(inviteExpiresAt(choice, now)?.toISOString() ?? null).toBe(expected);
  });
});

describe("inviteState / inviteLinkStatus", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const past = new Date("2026-09-24T11:59:59Z");
  const future = new Date("2026-09-24T12:00:01Z");

  it.each([
    { group: { inviteToken: "abc", inviteExpiresAt: null }, token: "abc", state: "OPEN", link: "VALID" },
    { group: { inviteToken: "abc", inviteExpiresAt: future }, token: "abc", state: "OPEN", link: "VALID" },
    { group: { inviteToken: "abc", inviteExpiresAt: past }, token: "abc", state: "EXPIRED", link: "EXPIRED" },
    { group: { inviteToken: "abc", inviteExpiresAt: now }, token: "abc", state: "EXPIRED", link: "EXPIRED" },
    // A reset link: the old token no longer matches.
    { group: { inviteToken: "new", inviteExpiresAt: null }, token: "abc", state: "OPEN", link: "INVALID" },
    { group: { inviteToken: null, inviteExpiresAt: null }, token: "abc", state: "STOPPED", link: "INVALID" },
  ] as const)("$state / $link", ({ group, token, state, link }) => {
    expect(inviteState(group, now)).toBe(state);
    expect(inviteLinkStatus(group, token, now)).toBe(link);
  });
});

describe("memberRowActions", () => {
  it.each([
    { viewerIsOrganizer: true, memberIsOrganizer: false, expected: ["REMOVE"] },
    { viewerIsOrganizer: true, memberIsOrganizer: true, expected: [] },
    { viewerIsOrganizer: false, memberIsOrganizer: false, expected: [] },
  ])("organizer viewer $viewerIsOrganizer, organizer row $memberIsOrganizer", ({ expected, ...input }) => {
    expect(memberRowActions(input)).toEqual(expected);
  });
});

describe("canLeaveGroup", () => {
  it.each([
    { isMember: true, isOrganizer: false, expected: true },
    { isMember: true, isOrganizer: true, expected: false },
    { isMember: false, isOrganizer: false, expected: false },
  ])("member $isMember, organizer $isOrganizer → $expected", ({ expected, ...input }) => {
    expect(canLeaveGroup(input)).toBe(expected);
  });
});
