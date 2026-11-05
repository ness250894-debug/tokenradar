/* eslint-disable @typescript-eslint/no-require-imports -- Install the TypeScript loader before importing the renderer. */
require("tsx/cjs");
const { parentPort, workerData } = require("node:worker_threads");
const { renderOgImage } = require("../../src/lib/og-renderer.ts");

if (!parentPort) throw new Error("OG image renderer must run in a worker thread.");

parentPort.on("message", async ({ id, data }) => {
  try {
    const png = await renderOgImage(data, workerData.font);
    parentPort.postMessage({ id, png });
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
