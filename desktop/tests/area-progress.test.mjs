import assert from "node:assert/strict";
import test from "node:test";
import { resolveAreaProgress } from "../../web/src/utility/area-progress.ts";

const edges = [
  "beach",
  "town",
  "coast",
  "optional-island",
  "passage",
  "town",
  "forest",
  "town",
  "beacon",
];
test("follows expected visits and catches up past skipped optional steps", () => {
  assert.deepEqual(resolveAreaProgress(edges, 0, "town"), {
    index: 1,
    reason: "advanced",
  });
  assert.deepEqual(resolveAreaProgress(edges, 2, "passage"), {
    index: 4,
    reason: "advanced",
  });
  assert.deepEqual(resolveAreaProgress(edges, 2, "beacon"), {
    index: 8,
    reason: "advanced",
  });
  assert.deepEqual(resolveAreaProgress(edges, 4, "town"), {
    index: 5,
    reason: "advanced",
  });
});
test("never guesses repeated visits or moves backwards automatically", () => {
  assert.deepEqual(resolveAreaProgress(edges, 2, "town"), {
    index: 2,
    reason: "ambiguous",
  });
  assert.deepEqual(resolveAreaProgress(edges, 6, "forest"), {
    index: 6,
    reason: "current",
  });
  assert.deepEqual(resolveAreaProgress(edges, 6, "coast"), {
    index: 6,
    reason: "earlier",
  });
  assert.deepEqual(resolveAreaProgress(edges, 6, "hideout"), {
    index: 6,
    reason: "off-route",
  });
});
