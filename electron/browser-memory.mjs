import { Worker } from "node:worker_threads";

export function createBrowserMemory({ storePath }) {
  let worker;
  let sequence = 0;
  const pending = new Map();
  const fail = error => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
    worker = null;
  };
  function call(method, payload = {}) {
    if (!worker) {
      worker = new Worker(new URL("./browser-memory-worker.mjs", import.meta.url), { workerData: { storePath: storePath() } });
      worker.on("message", ({ id, result, error, progress }) => {
        const request = pending.get(id);
        if (!request) return;
        if (progress) { request.onProgress?.(progress); return; }
        pending.delete(id);
        if (error) request.reject(new Error(error));
        else request.resolve(result);
        if (!pending.size) worker?.unref();
      });
      worker.on("error", fail);
      worker.on("exit", code => { if (worker) fail(new Error(`本地历史服务已退出 (${code})`)); });
    }
    worker.ref();
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const { onProgress, ...data } = payload;
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, method, payload: data });
    });
  }
  return { call };
}
