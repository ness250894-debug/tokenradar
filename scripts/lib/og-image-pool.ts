import * as path from "node:path";
import { Worker } from "node:worker_threads";
import type { OgRenderData } from "../../src/lib/og-renderer";

export interface OgImageJob { id: string; data: OgRenderData }
interface WorkerResult { id: number; png?: Uint8Array; error?: string }

export async function renderOgImageJobs<T extends OgImageJob>(
  jobs: readonly T[],
  concurrency: number,
  font: ArrayBuffer,
  onResult: (job: T, png?: Buffer, error?: Error) => void,
): Promise<number> {
  const workers: Worker[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let nextIndex = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => new Promise<void>((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, "og-image-worker.cjs"), {
        execArgv: [],
        workerData: { font },
      });
      workers.push(worker);
      let currentIndex = -1;
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const clearTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timers.delete(timer);
        }
      };
      const fail = (error: unknown) => {
        clearTimer();
        if (!finished) {
          finished = true;
          reject(error);
        }
      };
      const dispatch = () => {
        if (nextIndex >= jobs.length) {
          finished = true;
          resolve();
          return;
        }
        currentIndex = nextIndex++;
        timer = setTimeout(() => fail(new Error(`OG image worker timed out for ${jobs[currentIndex].id}.`)), 30_000);
        timers.add(timer);
        worker.postMessage({ id: currentIndex, data: jobs[currentIndex].data });
      };

      worker.once("error", fail);
      worker.once("exit", (code) => {
        if (!finished) fail(new Error(`OG image worker exited unexpectedly (${code}).`));
      });
      worker.on("message", (message: WorkerResult) => {
        if (finished) return;
        clearTimer();
        try {
          if (message.id !== currentIndex) throw new Error("Unexpected OG image worker response.");
          if (message.error) onResult(jobs[currentIndex], undefined, new Error(message.error));
          else if (message.png) onResult(jobs[currentIndex], Buffer.from(message.png));
          else throw new Error("OG image worker returned no image.");
          dispatch();
        } catch (error) { fail(error); }
      });
      dispatch();
    })));
    return workers.length;
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await Promise.allSettled(workers.map(worker => worker.terminate()));
  }
}
