import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs } from "../src/cli.js";
import { BridgeStore } from "../src/store.js";

test("creates, claims, messages, and handoffs through protocol files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-bridge-"));
  try {
    const store = new BridgeStore({ root });
    await store.init();

    const task = await store.createTask({
      title: "Implement CLI",
      body: "Build the local protocol commands",
      createdBy: "codex",
      files: ["src/cli.ts"],
      acceptanceCriteria: ["commands run"]
    });
    assert.equal(task.status, "open");

    const openPath = path.join(root, ".agent-bridge", "tasks", "open", `${task.id}.json`);
    assert.equal(JSON.parse(await readFile(openPath, "utf8")).title, "Implement CLI");

    const claimed = await store.claimTask({ id: task.id, agent: "agent-a", files: ["src/store.ts"] });
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.owner, "agent-a");
    assert.deepEqual(claimed.files, ["src/cli.ts", "src/store.ts"]);

    const message = await store.sendMessage({
      recipient: "claude",
      taskId: task.id,
      from: "agent-a",
      intent: "question",
      body: "Can you review this?"
    });
    assert.equal(message.taskId, task.id);
    assert.equal(message.recipient, "claude");

    const handoff = await store.handoff({
      taskId: task.id,
      from: "agent-a",
      to: "agent-b",
      summary: "Ready for review",
      verification: ["npm test"]
    });
    assert.equal(handoff.to, "agent-b");

    const status = await store.status();
    assert.equal(status.tasks.total, 1);
    assert.equal(status.tasks.claimed, 1);
    assert.equal(status.latestMessages.length, 1);
    assert.equal(status.latestHandoffs.length, 1);

    const inboxMessage = JSON.parse(
      await readFile(path.join(root, ".agent-bridge", "inbox", "claude", `${message.id}.json`), "utf8")
    );
    assert.equal(inboxMessage.intent, "question");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses positional commands and options", () => {
  const parsed = parseArgs([
    "task",
    "create",
    "Wire protocol",
    "--created-by=codex",
    "--root",
    "C:/tmp/project"
  ]);

  assert.deepEqual(parsed.positionals, ["task", "create", "Wire protocol"]);
  assert.equal(parsed.options["created-by"], "codex");
  assert.equal(parsed.options.root, "C:/tmp/project");
});
