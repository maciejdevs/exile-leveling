import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAreaProgress,
  routeDeviation,
} from "../../web/src/utility/area-progress.ts";

// Real Act 8 IDs: from Lunaris Concourse, the guide awaits Lunaris Temple 1.
// The Bath House is a unique later destination, but entering it now is a detour.
const edges = [
  "2_8_13",
  "2_8_6",
  "2_8_7_1_",
  "2_8_7_2",
  "2_8_town",
  "2_8_6",
  "2_8_13",
  "2_8_5",
  "2_8_4",
];

test("only the exact awaited area advances by one visit", () => {
  assert.deepEqual(resolveAreaProgress(edges, 1, "2_8_7_1_"), {
    index: 2,
    reason: "advanced",
  });
  for (const area of [
    "2_8_5",
    "2_8_town",
    "2_8_13",
    "2_9_town",
    "unknown-area",
  ]) {
    assert.deepEqual(resolveAreaProgress(edges, 1, area), {
      index: 1,
      reason: "unexpected",
    });
    assert.deepEqual(routeDeviation(edges, 1, area), {
      detectedAreaId: area,
      expectedAreaId: "2_8_7_1_",
    });
  }
});

test("returning from a wrong turn or town clears the warning without advancing", () => {
  for (const detour of ["2_8_5", "2_8_town"]) {
    const frozen = resolveAreaProgress(edges, 1, detour).index;
    assert.equal(frozen, 1);
    assert.deepEqual(resolveAreaProgress(edges, frozen, "2_8_6"), {
      index: 1,
      reason: "current",
    });
    assert.equal(routeDeviation(edges, frozen, "2_8_6"), null);
  }
});

test("the expected destination resumes progress directly from a detour", () => {
  const frozen = resolveAreaProgress(edges, 1, "2_8_5").index;
  const resumed = resolveAreaProgress(edges, frozen, "2_8_7_1_");
  assert.equal(resumed.index, 2);
  assert.equal(routeDeviation(edges, resumed.index, "2_8_7_1_"), null);
  assert.deepEqual(resolveAreaProgress(edges, resumed.index, "2_8_7_1_"), {
    index: 2,
    reason: "current",
  });
});

test("repeated areas follow the awaited occurrence, never a later matching visit", () => {
  assert.deepEqual(resolveAreaProgress(edges, 0, "2_8_6"), {
    index: 1,
    reason: "advanced",
  });
  assert.deepEqual(resolveAreaProgress(edges, 4, "2_8_6"), {
    index: 5,
    reason: "advanced",
  });
  assert.deepEqual(resolveAreaProgress(edges, 2, "2_8_6"), {
    index: 2,
    reason: "unexpected",
  });
});

test("explicit manual sync clears only a resolved mismatch", () => {
  assert.notEqual(routeDeviation(edges, 1, "2_8_5"), null);
  assert.equal(routeDeviation(edges, 7, "2_8_5"), null);
  assert.notEqual(routeDeviation(edges, 2, "2_8_5"), null);
});

test("startup history and completed routes do not produce warnings", () => {
  assert.equal(routeDeviation(edges, 1, null), null);
  assert.equal(routeDeviation(edges, 1, "2_8_7_1_"), null);
  assert.equal(routeDeviation(edges, edges.length - 1, "unknown-area"), null);
  assert.equal(routeDeviation([], 0, "unknown-area"), null);
  assert.deepEqual(resolveAreaProgress(edges, edges.length - 1, "2_8_town"), {
    index: edges.length - 1,
    reason: "unexpected",
  });
});
