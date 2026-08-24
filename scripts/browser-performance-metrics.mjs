export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[rank];
}

export function summarizeSamples(values, digits = 1) {
  if (!Array.isArray(values) || values.length === 0) {
    return { max: null, median: null, min: null, p95: null, runs: [] };
  }
  const round = (value) => Number(value.toFixed(digits));
  return {
    max: round(Math.max(...values)),
    median: round(median(values)),
    min: round(Math.min(...values)),
    p95: round(percentile(values, 0.95)),
    runs: values.map(round),
  };
}

export function parseCpuTime(value) {
  const input = String(value || "").trim();
  if (!input) return 0;
  const [dayPart, clockPart] = input.includes("-") ? input.split("-", 2) : ["0", input];
  const parts = clockPart.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  const seconds = parts.pop() || 0;
  const minutes = parts.pop() || 0;
  const hours = parts.pop() || 0;
  return Number(dayPart || 0) * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

export function parseProcessTable(output) {
  return String(output || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\s\S]+)$/);
      if (!match) return [];
      return [{
        command: match[5],
        cpuSeconds: parseCpuTime(match[4]),
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssBytes: Number(match[3]) * 1024,
      }];
    });
}

export function selectProcessTree(rows, rootPid) {
  const selectedPids = new Set([Number(rootPid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!selectedPids.has(row.pid) && selectedPids.has(row.ppid)) {
        selectedPids.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => selectedPids.has(row.pid));
}

export function summarizeProcessTree(rows, rootPid) {
  const tree = selectProcessTree(rows, rootPid);
  return {
    cpuSeconds: tree.reduce((sum, row) => sum + row.cpuSeconds, 0),
    processCount: tree.length,
    rssBytes: tree.reduce((sum, row) => sum + row.rssBytes, 0),
  };
}
