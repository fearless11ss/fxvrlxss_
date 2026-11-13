import { loadBotConfig } from "./config.js";
import { createBotRuntime } from "./runtime.js";

const runtime = createBotRuntime(loadBotConfig());

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.info(`Received ${signal}; shutting down.`);
  await runtime.stop();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await runtime.start();
