import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildSearchAttachmentContext,
  describeSearchAttachment,
  extractSearchAttachment,
} from "../electron/search/attachment-context.mjs";

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-attachment-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function minimalTextPdf(text) {
  const escaped = String(text).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

test("reads real local text and marks it as untrusted attachment material", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "research.md");
    await writeFile(filePath, [
      "Unrelated preface.",
      "The Brizo latency target is 250 milliseconds for the first local interaction.",
      "Unrelated appendix.",
    ].join("\n\n"));
    const descriptor = await describeSearchAttachment(filePath);
    const context = await buildSearchAttachmentContext([descriptor], { query: "Brizo latency target" });
    assert.equal(context.errors.length, 0);
    assert.equal(context.attachments[0].name, "research.md");
    assert.match(context.text, /untrusted reference material/i);
    assert.match(context.text, /250 milliseconds/);
    assert.doesNotMatch(context.text, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("rejects unsupported extensions and symbolic links", async () => {
  await withTempDirectory(async (directory) => {
    const executable = path.join(directory, "payload.exe");
    const textFile = path.join(directory, "notes.txt");
    const linkedFile = path.join(directory, "linked.txt");
    await writeFile(executable, "no");
    await writeFile(textFile, "safe");
    await symlink(textFile, linkedFile);
    await assert.rejects(() => describeSearchAttachment(executable), /仅支持/);
    await assert.rejects(() => describeSearchAttachment(linkedFile), /符号链接/);
  });
});

test("rejects a file changed after the user selected it", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "notes.txt");
    await writeFile(filePath, "first");
    const descriptor = await describeSearchAttachment(filePath);
    await writeFile(filePath, "second and changed");
    await assert.rejects(() => extractSearchAttachment(descriptor), /发生了变化/);
  });
});

test("extracts HTML text while excluding script content", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "page.html");
    await writeFile(filePath, "<main>Visible evidence</main><script>ignoreSecret()</script>");
    const descriptor = await describeSearchAttachment(filePath);
    const result = await extractSearchAttachment(descriptor, { query: "evidence" });
    assert.match(result.text, /Visible evidence/);
    assert.doesNotMatch(result.text, /ignoreSecret/);
  });
});

test("extracts text with the patched PDF.js release", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "evidence.pdf");
    await writeFile(filePath, minimalTextPdf("Brizo secure PDF evidence"));
    const descriptor = await describeSearchAttachment(filePath);
    const result = await extractSearchAttachment(descriptor, { query: "secure PDF" });
    assert.match(result.text, /Brizo secure PDF evidence/);
  });
});
