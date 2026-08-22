import { randomUUID } from "crypto";
import * as fs from "fs";

interface ProcessLockOwner {
  pid: number;
  token: string | null;
  createdAt: string | null;
}

function getErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

function parseLockOwner(contents: string): ProcessLockOwner | null {
  const trimmed = contents.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Partial<ProcessLockOwner>;
    if (!Number.isInteger(parsed.pid) || Number(parsed.pid) <= 0) return null;
    return {
      pid: Number(parsed.pid),
      token: typeof parsed.token === "string" && parsed.token ? parsed.token : null,
      createdAt: typeof parsed.createdAt === "string" && parsed.createdAt ? parsed.createdAt : null,
    };
  } catch {
    const legacyPid = Number(trimmed);
    return Number.isInteger(legacyPid) && legacyPid > 0
      ? { pid: legacyPid, token: null, createdAt: null }
      : null;
  }
}

export function isProcessProbablyRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // A permission error means the process exists but cannot be signalled by this user.
    return getErrorCode(error) === "EPERM";
  }
}

/**
 * Atomically acquires a cross-process lock without deleting a lock another process may own.
 * Stale locks require explicit removal after the operator verifies no export is running.
 */
export function acquireProcessLock(lockPath: string): () => void {
  const owner: ProcessLockOwner = {
    pid: process.pid,
    token: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, `${JSON.stringify(owner)}\n`, { flag: "wx" });
      return () => {
        let current: ProcessLockOwner | null;
        try {
          current = parseLockOwner(fs.readFileSync(lockPath, "utf-8"));
        } catch (error) {
          if (getErrorCode(error) === "ENOENT") return;
          throw error;
        }

        if (current?.token !== owner.token) return;

        // Cooperating contenders acquire with `wx` and never remove an existing
        // lock, so none can replace this path between the synchronous check and
        // removal. The token check additionally preserves externally replaced locks.
        try {
          fs.rmSync(lockPath);
        } catch (error) {
          if (getErrorCode(error) !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (getErrorCode(error) !== "EEXIST") throw error;

      let existing: ProcessLockOwner | null;
      try {
        existing = parseLockOwner(fs.readFileSync(lockPath, "utf-8"));
      } catch (readError) {
        if (getErrorCode(readError) === "ENOENT") continue;
        throw readError;
      }

      if (existing && isProcessProbablyRunning(existing.pid)) {
        throw new Error(`Another index-status export is already running with PID ${existing.pid}.`);
      }

      if (existing) {
        throw new Error(
          `A stale index-status lock exists at ${lockPath} for PID ${existing.pid}. `
          + "After verifying no export is running, remove that lock file and retry.",
        );
      }

      throw new Error(
        `An unreadable index-status lock exists at ${lockPath}. `
        + "After verifying no export is running, remove that lock file and retry.",
      );
    }
  }

  throw new Error(`Could not acquire the index-status lock at ${lockPath}; retry the export.`);
}
