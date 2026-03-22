import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { sendTelegramAlert } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const alertFile = path.resolve(__dirname, "../data/latest-batch-alert.txt");
  if (!fs.existsSync(alertFile)) {
    console.log("No alert file found. Skipping telegram notification.");
    return;
  }
  
  const message = fs.readFileSync(alertFile, "utf-8");
  if (!message.trim()) {
    console.log("Alert payload is empty (no new articles). Skipping telegram notification.");
    return;
  }

  try {
    await sendTelegramAlert(message);
    console.log("✅ Successfully dispatched post-deployment Telegram alert.");
  } catch (error) {
    console.error("❌ Failed to send alert:", error);
    process.exit(1);
  }
}

main();
