#!/usr/bin/env node

import { createSourceSnapshot } from "./sync-browse.mjs";

try {
  const snapshot = await createSourceSnapshot();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    fileCount: snapshot.files.length,
    overallDigest: snapshot.manifest.overallDigest,
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: { code: error.code || "BOUNDARY_FAILED", message: error.message },
  })}\n`);
  process.exitCode = 1;
}
