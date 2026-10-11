import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../frontend/js/escape.js";

test("escapes tag and attribute breakouts", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("it's & </textarea>"), "it&#39;s &amp; &lt;/textarea&gt;");
});

test("handles empty values", () => {
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(0), "0");
});
