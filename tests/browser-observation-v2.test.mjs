import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

import { snapshotBrowserPage } from "../electron/browser-command-agent.mjs";

const fixtureUrl = new URL("./fixtures/browser-observation-v2.json", import.meta.url);
const sourceUrl = new URL("../electron/browser-command-agent.mjs", import.meta.url);

test("Observation v2 fixture preserves public values and redacts sensitive values", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const [text, password, select] = fixture.elements;

  assert.equal(text.ref, "@e1");
  assert.equal(text.value, "Alice");
  assert.equal(text.required, true);
  assert.equal(text.validity.valid, true);

  assert.equal(password.ref, "@e2");
  assert.equal(Object.hasOwn(password, "value"), false);
  assert.equal(password.sensitive, true);
  assert.equal(password.hasValue, true);
  assert.equal(password.valueLength, 12);

  assert.equal(select.ref, "@e3");
  assert.equal(select.frameRef, "@f1");
  assert.equal(select.options[1].selected, true);
  assert.deepEqual(select.selectedValues, ["CN"]);
  assert.equal(fixture.frames[0].sameOrigin, true);
  assert.equal(fixture.frames[1].sameOrigin, false);
});

test("generated observation script compiles and contains the v2 form contract", async () => {
  let generated = "";
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const result = await snapshotBrowserPage({
    isDestroyed: () => false,
    executeJavaScript: async (script) => {
      generated = script;
      return fixture;
    },
  });

  assert.equal(result, fixture);
  assert.doesNotThrow(() => new vm.Script(generated, { filename: "observation-v2-generated.js" }));
  for (const field of [
    "fieldName",
    "autocomplete",
    "required",
    "disabled",
    "readOnly",
    "min",
    "max",
    "step",
    "pattern",
    "minLength",
    "maxLength",
    "checked",
    "selected",
    "selectedValues",
    "optionsTruncated",
    "willValidate",
    "validity",
    "hasValue",
    "valueLength",
    "frames",
    "frameRef",
    "frameDepth",
  ]) {
    assert.match(generated, new RegExp(`\\b${field}\\b`), field);
  }
  for (const validityFlag of [
    "valueMissing",
    "typeMismatch",
    "patternMismatch",
    "tooLong",
    "tooShort",
    "rangeUnderflow",
    "rangeOverflow",
    "stepMismatch",
    "badInput",
    "customError",
  ]) {
    assert.match(generated, new RegExp(`\\b${validityFlag}\\b`), validityFlag);
  }
  assert.match(generated, /shadowRoot/);
  assert.match(generated, /contentDocument/);
  assert.match(generated, /sameOrigin/);
  assert.match(generated, /slice\(0, 60\)/);
  assert.match(generated, /elements\.length >= 140/);
  assert.match(generated, /frames\.length >= 24/);
  assert.match(generated, /offsetX/);
  assert.match(generated, /scaleX/);
});

test("every ref-based executor uses the shadow/frame-aware locator", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /function locateBrowserAgentElement\(domRef\)/);
  assert.match(source, /Cross-origin frame: it is deliberately observable only as a boundary/);
  const locatorUses = source.match(/BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE}\(/g) || [];
  assert.equal(locatorUses.length, 4, "click, fill, select and targeted press must share the recursive locator");
  assert.match(source, /located\.offsetX \+ \(rect\.left \+ rect\.width \/ 2\) \* located\.scaleX/);
  assert.match(source, /element\.ownerDocument\?\.activeElement/);
});
