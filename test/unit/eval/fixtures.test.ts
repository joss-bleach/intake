import { describe, expect, it } from "vitest";
import {
  loadDescriptionFixtures,
  loadLabelFixtures,
  readLabelImageBase64,
} from "../../../src/eval/fixtures";

// Reads the real committed fixtures (test/fixtures/eval) — proves the
// loader/schema/image-file trio actually agrees with what's on disk, not
// just a fabricated in-memory example.
describe("loadDescriptionFixtures", () => {
  it("loads and decodes every committed description fixture", () => {
    const fixtures = loadDescriptionFixtures();

    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(fixture.expected.ingredients.length).toBeGreaterThan(0);
    }
  });
});

describe("loadLabelFixtures", () => {
  it("loads and decodes every committed label fixture, each with a readable image", () => {
    const fixtures = loadLabelFixtures();

    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(fixture.expected.nutrients.length).toBeGreaterThan(0);
      expect(readLabelImageBase64(fixture).length).toBeGreaterThan(0);
    }
  });
});
