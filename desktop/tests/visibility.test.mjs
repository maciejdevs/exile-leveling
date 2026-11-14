import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowOverlay, updateGameFocus } from "../visibility.mjs";
import { parseFocusMessage } from "../windows-focus.mjs";

test("only PoE can start a visible session; other apps and focus errors hide it", () => {
  let active = false;
  for (const [foreground, expected] of [
    ["other", false],
    ["overlay", false],
    ["game", true],
    ["overlay", true],
    ["other", false],
    ["overlay", false],
    ["game", true],
  ]) {
    active = updateGameFocus(active, foreground);
    assert.equal(active, expected);
    assert.equal(
      shouldShowOverlay({ gameActive: active, manuallyHidden: false }),
      expected,
    );
    assert.equal(
      shouldShowOverlay({ gameActive: active, manuallyHidden: true }),
      false,
    );
  }
});

test("validates helper responses and ignores relative install paths", () => {
  assert.deepEqual(
    parseFocusMessage('{"foreground":"other","directories":["relative"]}'),
    { foreground: "other", directories: [] },
  );
  assert.throws(() =>
    parseFocusMessage('{"foreground":"unknown","directories":[]}'),
  );
  assert.throws(() =>
    parseFocusMessage('{"foreground":"game","directories":"invalid"}'),
  );
  assert.throws(() => parseFocusMessage("invalid json"));
});
