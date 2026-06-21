import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { main, parseArgs } from "../src/cli.js";
import { BridgeStore } from "../src/store.js";

test("creates, claims, messages, and handoffs through protocol files", async () => {
  await withTempRoot(async (root) => {
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
      intent: "spawn_agents",
      body: "Goal: run parallel checks. Count: 2."
    });
    assert.equal(message.taskId, task.id);
    assert.equal(message.recipient, "claude");
    assert.equal(message.intent, "spawn_agents");

    const conversation = await store.appendConversation({
      taskId: task.id,
      from: "agent-a",
      recipient: "agent-b",
      intent: "proposal",
      body: "Proposal: split CLI and store work.",
      files: ["src/cli.ts"]
    });
    assert.equal(conversation.taskId, task.id);
    assert.equal(conversation.intent, "proposal");

    const planPath = await store.writePlan({
      taskId: task.id,
      from: "agent-a",
      body: "Goal: finish bridge CLI.\nSteps: implement, test, document."
    });
    assert.match(await readFile(planPath, "utf8"), /Goal: finish bridge CLI/);

    const presence = await store.updatePresence({
      agent: "agent-a",
      status: "working",
      taskId: task.id,
      files: ["src/cli.ts"],
      canAcceptWork: false
    });
    assert.equal(presence.canAcceptWork, false);

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
    assert.equal(status.latestMessages.length, 2);
    assert.equal(status.latestHandoffs.length, 1);

    const inboxMessage = JSON.parse(
      await readFile(path.join(root, ".agent-bridge", "inbox", "claude", `${message.id}.json`), "utf8")
    );
    assert.equal(inboxMessage.intent, "spawn_agents");

    const conversationRaw = await readFile(
      path.join(root, ".agent-bridge", "conversations", `${task.id}.jsonl`),
      "utf8"
    );
    assert.match(conversationRaw, /split CLI and store work/);

    const presenceRaw = JSON.parse(await readFile(path.join(root, ".agent-bridge", "presence", "agent-a.json"), "utf8"));
    assert.equal(presenceRaw.status, "working");

    const inboxMessages = await store.listInboxMessages("claude");
    assert.equal(inboxMessages.length, 1);
    assert.equal(inboxMessages[0].message.intent, "spawn_agents");

    const handoffMessages = await store.listInboxMessages("agent-b");
    assert.equal(handoffMessages.length, 1);
    assert.equal(handoffMessages[0].message.intent, "handoff");

    const report = await store.validate();
    assert.equal(report.ok, true);
  });
});

test("conflicting file claims throw unless forced", async () => {
  await withTempRoot(async (root) => {
    const store = new BridgeStore({ root });
    const first = await store.createTask({
      title: "Touch shared module",
      createdBy: "codex",
      files: ["src/shared.ts"]
    });
    const second = await store.createTask({
      title: "Refactor shared module",
      createdBy: "claude",
      files: ["src\\shared.ts"]
    });

    await store.claimTask({ id: first.id, agent: "codex" });

    await assert.rejects(
      store.claimTask({ id: second.id, agent: "claude" }),
      /File claim conflict: src\/shared\.ts is already claimed by codex, claude/
    );

    const forced = await store.claimTask({ id: second.id, agent: "claude", force: true });
    assert.equal(forced.status, "claimed");
    assert.equal(forced.owner, "claude");
  });
});

test("path-bearing ids and agents must be safe path segments", async () => {
  await withTempRoot(async (root) => {
    const store = new BridgeStore({ root });
    const task = await store.createTask({
      title: "Safe ids",
      createdBy: "codex",
      acceptanceCriteria: ["rejects traversal"]
    });

    await assert.rejects(
      store.appendConversation({
        taskId: "../escape",
        from: "codex",
        body: "bad"
      }),
      /safe path segment/
    );

    await assert.rejects(
      store.writePlan({
        taskId: "../escape",
        from: "codex",
        body: "bad"
      }),
      /safe path segment/
    );

    await assert.rejects(
      store.updatePresence({
        agent: "../escape",
        taskId: task.id
      }),
      /safe path segment/
    );

    await assert.rejects(
      store.sendMessage({
        recipient: "../escape",
        from: "codex",
        body: "bad"
      }),
      /safe path segment/
    );
  });
});

test("listening to a new safe agent creates an empty inbox", async () => {
  await withTempRoot(async (root) => {
    const store = new BridgeStore({ root });
    const messages = await store.listInboxMessages("helper-1");
    assert.deepEqual(messages, []);

    const inboxEntries = await readdir(path.join(root, ".agent-bridge", "inbox"));
    assert.ok(inboxEntries.includes("helper-1"));
  });
});

test("status and validate report conflicting active file claims", async () => {
  await withTempRoot(async (root) => {
    const store = new BridgeStore({ root });
    const first = await store.createTask({
      title: "Own parser",
      createdBy: "codex",
      files: ["src/parser.ts"],
      acceptanceCriteria: ["parses valid config"]
    });
    const second = await store.createTask({
      title: "Update parser",
      createdBy: "claude",
      files: ["src\\parser.ts"],
      acceptanceCriteria: ["handles invalid config"]
    });

    await store.claimTask({ id: first.id, agent: "codex" });
    await store.claimTask({ id: second.id, agent: "claude", force: true });

    const status = await store.status();
    assert.deepEqual(status.conflicts, [
      {
        file: "src/parser.ts",
        taskIds: [first.id, second.id],
        owners: ["codex", "claude"]
      }
    ]);

    const report = await store.validate();
    assert.equal(report.ok, false);
    assert.deepEqual(report.conflicts, status.conflicts);
    assert.match(report.warnings.join("\n"), /src\/parser\.ts: claimed by .* across codex, claude/);
  });
});

test("installTemplates writes AGENTS.md and CLAUDE.md without duplicating sections", async () => {
  await withTempRoot(async (root) => {
    const store = new BridgeStore({ root });
    await writeFile(path.join(root, "AGENTS.md"), "# Existing Agent Notes\n\nKeep this section.\n", "utf8");

    const firstInstall = await store.installTemplates();
    assert.deepEqual(firstInstall.installed.sort(), ["AGENTS.md", "CLAUDE.md"]);
    assert.deepEqual(firstInstall.skipped, []);

    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    const claude = await readFile(path.join(root, "CLAUDE.md"), "utf8");
    assert.match(agents, /^# Existing Agent Notes/m);
    assert.equal(sectionCount(agents, "## Agent Skill Bridge"), 1);
    assert.equal(sectionCount(claude, "## Agent Skill Bridge"), 1);
    assert.match(agents, /conversation append/);
    assert.match(claude, /spawn_agents/);

    const secondInstall = await store.installTemplates();
    assert.deepEqual(secondInstall.installed, []);
    assert.deepEqual(secondInstall.skipped.sort(), ["AGENTS.md", "CLAUDE.md"]);

    const agentsAfterSecondInstall = await readFile(path.join(root, "AGENTS.md"), "utf8");
    const claudeAfterSecondInstall = await readFile(path.join(root, "CLAUDE.md"), "utf8");
    assert.equal(sectionCount(agentsAfterSecondInstall, "## Agent Skill Bridge"), 1);
    assert.equal(sectionCount(claudeAfterSecondInstall, "## Agent Skill Bridge"), 1);
  });
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

test("CLI rejects invalid message intents instead of downgrading to note", async () => {
  await assert.rejects(
    main(["message", "send", "claude", "--from", "codex", "--intent", "review-request", "--body", "typo"]),
    /Invalid --intent review-request/
  );
});

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-bridge-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function sectionCount(content: string, marker: string): number {
  return content.split(marker).length - 1;
}
