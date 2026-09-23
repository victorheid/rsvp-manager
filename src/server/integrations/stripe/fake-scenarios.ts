/**
 * What the pretend cardholder does (the fake gateway, and the test-mode card
 * form that plays the browser). Lives in its own file so client code can
 * import the list without pulling in the fake gateway itself.
 */
export const FAKE_CARD_SCENARIOS = ["visa", "declined", "expired", "insufficient_funds", "requires_action"] as const;
export type FakeCardScenario = (typeof FAKE_CARD_SCENARIOS)[number];
