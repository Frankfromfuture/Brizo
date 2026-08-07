// Server-Sent Events decoder for streaming chat completions.
//
// Pure and transport-free so it can be unit tested without a network. The five
// things that break naive implementations, all handled here:
//   1. A multi-byte UTF-8 character split across two chunks. Decoding each chunk
//      independently turns a 3-byte Chinese character into U+FFFD. Since Brizo's
//      answers are primarily Chinese this is a guaranteed corruption, not an edge
//      case, so we hold a streaming TextDecoder across the whole response.
//   2. A `data:` line split across chunks: only text up to the last newline is
//      processed; the remainder stays buffered.
//   3. CRLF line endings.
//   4. Comment/keepalive lines beginning with ":" must be skipped, not parsed.
//   5. Consecutive `data:` lines belong to one event and join with "\n".

export function createSseDecoder() {
  const textDecoder = new TextDecoder("utf-8");
  let buffer = "";
  let dataLines = [];

  const takeEvent = (out) => {
    if (!dataLines.length) return;
    out.push(dataLines.join("\n"));
    dataLines = [];
  };

  const consumeLine = (rawLine, out) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      takeEvent(out);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") return;
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    dataLines.push(value);
  };

  return {
    /**
     * @param {Uint8Array|string} chunk
     * @returns {string[]} complete `data:` payloads, in order
     */
    push(chunk) {
      const text = typeof chunk === "string"
        ? chunk
        : textDecoder.decode(chunk, { stream: true });
      if (!text) return [];
      buffer += text;
      const out = [];
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        consumeLine(buffer.slice(0, newlineIndex), out);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
      return out;
    },

    /** Flush trailing bytes for servers that end without a final newline. */
    flush() {
      const out = [];
      const tail = textDecoder.decode();
      if (tail) buffer += tail;
      if (buffer) {
        consumeLine(buffer, out);
        buffer = "";
      }
      takeEvent(out);
      return out;
    },
  };
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
