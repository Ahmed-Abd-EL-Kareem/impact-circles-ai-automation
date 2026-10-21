import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dbPath = path.join(os.homedir(), ".n8n", "database.sqlite");
if (!fs.existsSync(dbPath)) {
  console.log("n8n database.sqlite not found at:", dbPath);
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
const workflowJson = JSON.parse(fs.readFileSync("n8n/workflows/finance-processing.json", "utf8"));

const existing = db.prepare("SELECT id, activeVersionId FROM workflow_entity WHERE name = 'Finance Document Processing Pipeline'").get();

if (existing) {
  console.log("Found workflow in SQLite:", existing.id);
  const nodesJson = JSON.stringify(workflowJson.nodes);
  const connectionsJson = JSON.stringify(workflowJson.connections);

  db.prepare("UPDATE workflow_entity SET nodes = ?, connections = ? WHERE id = ?").run(nodesJson, connectionsJson, existing.id);

  if (existing.activeVersionId) {
    db.prepare("UPDATE workflow_history SET nodes = ?, connections = ? WHERE versionId = ?").run(nodesJson, connectionsJson, existing.activeVersionId);
    console.log("Updated workflow_history for activeVersionId:", existing.activeVersionId);
  }
  console.log("✓ Successfully synchronized n8n workflow into SQLite database!");
} else {
  console.log("Workflow 'Finance Document Processing Pipeline' not found in SQLite.");
}
