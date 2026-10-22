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

const workflows = [
  {
    name: "Finance Document Processing Pipeline",
    filePath: "n8n/workflows/finance-processing.json",
  },
  {
    name: "Content Generation and Publishing Pipeline",
    filePath: "n8n/workflows/content-publishing.json",
  },
];

for (const wf of workflows) {
  if (!fs.existsSync(wf.filePath)) {
    console.warn(`File not found: ${wf.filePath}`);
    continue;
  }

  const workflowJson = JSON.parse(fs.readFileSync(wf.filePath, "utf8"));
  const existingWorkflows = db
    .prepare("SELECT id, activeVersionId, active FROM workflow_entity WHERE name = ?")
    .all(wf.name);

  if (existingWorkflows.length > 0) {
    const nodesJson = JSON.stringify(workflowJson.nodes);
    const connectionsJson = JSON.stringify(workflowJson.connections);

    for (const existing of existingWorkflows) {
      console.log(
        `Synchronizing workflow '${wf.name}' (ID: ${existing.id}, active: ${existing.active}) in SQLite`
      );

      db.prepare(
        "UPDATE workflow_entity SET nodes = ?, connections = ? WHERE id = ?"
      ).run(nodesJson, connectionsJson, existing.id);

      if (existing.activeVersionId) {
        db.prepare(
          "UPDATE workflow_history SET nodes = ?, connections = ? WHERE versionId = ?"
        ).run(nodesJson, connectionsJson, existing.activeVersionId);
        console.log(
          `Updated workflow_history for activeVersionId: ${existing.activeVersionId}`
        );
      }
    }
    console.log(`✓ Successfully synchronized '${wf.name}' into SQLite database!\n`);
  } else {
    console.log(`Workflow '${wf.name}' not found in SQLite.\n`);
  }
}
