import { spawn } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Master Integration Test Runner:
 * 1. Runs Direct Pipeline Integration Test (Gemini + Neon DB)
 * 2. Runs True Production n8n End-to-End Test (Client -> n8n -> Gemini -> Neon -> Response)
 *
 * NOTE: If n8n or credentials are unavailable, this test exits with a NON-ZERO code
 * and marks the run as BLOCKED / NOT RUN. It never gives false success.
 */
function runSubScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["tsx", "--env-file=.env", scriptPath], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    p.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${path.basename(scriptPath)} exited with code ${code}`));
      }
    });

    p.on("error", (err) => {
      reject(err);
    });
  });
}

async function runMasterIntegration() {
  console.log("=================================================================");
  console.log(" Impact Circles — Full Integration & Verification Test Suite");
  console.log("=================================================================\n");

  const directScript = path.join(process.cwd(), "scripts", "test-direct-pipeline.ts");
  const e2eScript = path.join(process.cwd(), "scripts", "test-n8n-e2e.ts");

  console.log(">>> RUNNING SUITE 1: Direct Pipeline Integration Test <<<\n");
  await runSubScript(directScript);

  console.log("\nWaiting 10 seconds for Gemini API rate limits to settle before running E2E suite...\n");
  await new Promise((r) => setTimeout(r, 10000));

  console.log("\n>>> RUNNING SUITE 2: True Production n8n End-to-End Test <<<\n");
  await runSubScript(e2eScript);

  console.log("\n=================================================================");
  console.log(" ✓ ALL INTEGRATION AND E2E SUITES PASSED WITH 100% SUCCESS!");
  console.log("=================================================================\n");
}

runMasterIntegration().catch((err) => {
  console.error("\n❌ Integration suite execution failed:", err.message);
  process.exit(1);
});
