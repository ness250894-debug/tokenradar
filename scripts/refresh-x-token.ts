/** Refresh, rotate, and persist the X OAuth token without publishing content. */

import { pathToFileURL } from "node:url";

import { getXClient } from "../src/lib/x-client";
import { formatErrorForLog } from "../src/lib/utils";

export async function refreshXTokenOnly(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("The refresh-only command must run in GitHub Actions so the rotated token can be persisted.");
  }

  await getXClient();
  console.info("X OAuth refresh completed and the rotated credential was persisted without publishing.");
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  refreshXTokenOnly().catch((error) => {
    console.error(`X OAuth refresh failed: ${formatErrorForLog(error)}`);
    process.exitCode = 1;
  });
}
