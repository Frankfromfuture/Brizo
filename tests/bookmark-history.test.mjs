import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readChromiumVisitWeights } from "../electron/bookmark-history.mjs";

test("Chromium history reader returns only requested URLs and preserves visit counts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-history-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const historyPath = path.join(directory, "History");
  const database = new DatabaseSync(historyPath);
  database.exec("CREATE TABLE urls (url TEXT, visit_count INTEGER, last_visit_time INTEGER)");
  database.prepare("INSERT INTO urls VALUES (?, ?, ?)").run("https://www.example.com/a", 12, 13300000000000000);
  database.prepare("INSERT INTO urls VALUES (?, ?, ?)").run("https://private.example/", 99, 13300000000000000);
  database.close();
  const result = await readChromiumVisitWeights([historyPath], ["https://www.example.com/a"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].visits, 12);
  assert.equal(result[0].url, "https://example.com/a");
});
