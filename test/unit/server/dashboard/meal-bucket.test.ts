import { describe, expect, it } from "vitest";
import { mealForLoggedAt } from "../../../../src/server/dashboard/meal-bucket";

const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour, 30));

describe("mealForLoggedAt", () => {
  it.each([
    [4, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [14, "lunch"],
    [15, "dinner"],
    [20, "dinner"],
    [21, "snacks"],
    [23, "snacks"],
    [0, "snacks"],
    [3, "snacks"],
  ] as const)("buckets hour %i UTC as %s", (hour, meal) => {
    expect(mealForLoggedAt(at(hour))).toBe(meal);
  });
});
