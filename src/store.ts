import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BRIDGE_DIR,
  HandoffRecord,
  makeId,
  MessageIntent,
  MessageRecord,
  nowIso,
  StatusSnapshot,
  TASK_STATUSES,
  TaskRecord,
  TaskStatus
} from "./protocol.js";
import {
  assertHandoffRecord,
  assertMessageRecord,
  assertTaskRecord,
  requireString
} from "./validation.js";

export interface BridgeStoreOptions {
  root?: string;
}

export interface CreateTaskInput {
  title: string;
  body?: string;
  createdBy?: string;
  files?: string[];
  acceptanceCriteria?: string[];
  dependencies?: string[];
}

export interface ClaimTaskInput {
  id: string;
  agent: string;
  files?: string[];
}

export interface SendMessageInput {
  recipient: string;
  taskId?: string;
  from: string;
  intent?: MessageIntent;
  body: string;
  files?: string[];
}

export interface HandoffInput {
  taskId: string;
  from: string;
  to: string;
  summary: string;
  changedFiles?: string[];
  remainingWork?: string[];
  risks?: string[];
  verification?: string[];
}

export class BridgeStore {
  readonly root: string;
  readonly bridgeDir: string;

  constructor(options: BridgeStoreOptions = {}) {
    this.root = path.resolve(options.root ?? process.cwd());
    this.bridgeDir = path.join(this.root, BRIDGE_DIR);
  }

  async init(): Promise<void> {
    await mkdir(this.bridgeDir, { recursive: true });
    await Promise.all([
      mkdir(path.join(this.bridgeDir, "inbox", "codex"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "inbox", "claude"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "inbox", "human"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "context"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "skills", "shared"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "skills", "codex"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "skills", "claude"), { recursive: true }),
      mkdir(path.join(this.bridgeDir, "logs"), { recursive: true }),
      ...TASK_STATUSES.map((status) => mkdir(this.taskStatusDir(status), { recursive: true }))
    ]);
    await this.ensureFile(this.logPath("messages.jsonl"));
    await this.ensureFile(this.logPath("tasks.jsonl"));
    await this.ensureFile(this.logPath("handoffs.jsonl"));
    await this.ensureFile(
      path.join(this.bridgeDir, "context", "project.md"),
      "# Project Context\n\nDescribe the product, users, repo layout, and current goal.\n"
    );
    await this.ensureFile(
      path.join(this.bridgeDir, "context", "decisions.md"),
      "# Decisions\n\nRecord human-approved decisions here.\n"
    );
    await this.ensureFile(
      path.join(this.bridgeDir, "context", "constraints.md"),
      "# Constraints\n\nRecord boundaries, coding rules, and files agents should avoid.\n"
    );
    await this.ensureFile(
      path.join(this.bridgeDir, "skills", "shared", "collaboration.md"),
      sharedSkillText()
    );
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    await this.init();
    const createdAt = nowIso();
    const task: TaskRecord = {
      id: makeId("TASK"),
      title: requireString(input.title, "title"),
      status: "open",
      createdBy: input.createdBy ? requireString(input.createdBy, "createdBy") : undefined,
      createdAt,
      updatedAt: createdAt,
      dependencies: input.dependencies ?? [],
      files: input.files ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      notes: input.body?.trim() ?? ""
    };
    assertTaskRecord(task);
    await this.writeTask(task);
    await this.appendJsonLine(this.logPath("tasks.jsonl"), task);
    return task;
  }

  async claimTask(input: ClaimTaskInput): Promise<TaskRecord> {
    await this.init();
    const task = await this.readTask(input.id);
    const previousPath = this.taskPath(task);
    task.status = "claimed";
    task.owner = requireString(input.agent, "agent");
    task.files = mergeLists(task.files, input.files ?? []);
    task.updatedAt = nowIso();
    assertTaskRecord(task);
    await this.writeTask(task);
    if (previousPath !== this.taskPath(task)) {
      await removeIfExists(previousPath);
    }
    await this.appendJsonLine(this.logPath("tasks.jsonl"), task);
    return task;
  }

  async sendMessage(input: SendMessageInput): Promise<MessageRecord> {
    await this.init();
    const message: MessageRecord = {
      id: makeId("MSG"),
      taskId: input.taskId ? requireString(input.taskId, "task") : undefined,
      sender: requireString(input.from, "from"),
      recipient: requireString(input.recipient, "recipient"),
      intent: input.intent ?? "note",
      body: requireString(input.body, "body"),
      createdAt: nowIso(),
      files: input.files ?? []
    };
    assertMessageRecord(message);
    const inboxDir = path.join(this.bridgeDir, "inbox", message.recipient);
    await mkdir(inboxDir, { recursive: true });
    await writeJson(path.join(inboxDir, `${message.id}.json`), message);
    await this.appendJsonLine(this.logPath("messages.jsonl"), message);
    return message;
  }

  async handoff(input: HandoffInput): Promise<HandoffRecord> {
    await this.init();
    const task = await this.readTask(input.taskId);
    const handoff: HandoffRecord = {
      id: makeId("HANDOFF"),
      taskId: task.id,
      from: requireString(input.from, "from"),
      to: requireString(input.to, "to"),
      summary: requireString(input.summary, "summary"),
      changedFiles: input.changedFiles ?? [],
      remainingWork: input.remainingWork ?? [],
      risks: input.risks ?? [],
      verification: input.verification ?? [],
      createdAt: nowIso()
    };
    assertHandoffRecord(handoff);
    task.owner = handoff.to;
    task.files = mergeLists(task.files, handoff.changedFiles);
    task.updatedAt = handoff.createdAt;
    await this.writeTask(task);
    await this.appendJsonLine(this.logPath("handoffs.jsonl"), handoff);
    return handoff;
  }

  async completeTask(id: string): Promise<TaskRecord> {
    await this.init();
    const task = await this.readTask(id);
    const previousPath = this.taskPath(task);
    task.status = "done";
    task.updatedAt = nowIso();
    assertTaskRecord(task);
    await this.writeTask(task);
    if (previousPath !== this.taskPath(task)) {
      await removeIfExists(previousPath);
    }
    await this.appendJsonLine(this.logPath("tasks.jsonl"), task);
    return task;
  }

  async status(): Promise<StatusSnapshot> {
    await this.init();
    const tasks = await this.listTasks();
    return {
      root: this.root,
      bridgeDir: this.bridgeDir,
      tasks: {
        total: tasks.length,
        open: tasks.filter((task) => task.status === "open").length,
        claimed: tasks.filter((task) => task.status === "claimed").length,
        blocked: tasks.filter((task) => task.status === "blocked").length,
        done: tasks.filter((task) => task.status === "done").length
      },
      latestMessages: (await this.readJsonLines(this.logPath("messages.jsonl"), assertMessageRecord)).slice(-5),
      latestHandoffs: (await this.readJsonLines(this.logPath("handoffs.jsonl"), assertHandoffRecord)).slice(-5)
    };
  }

  async listTasks(): Promise<TaskRecord[]> {
    await this.init();
    const tasks: TaskRecord[] = [];
    for (const status of TASK_STATUSES) {
      const dir = this.taskStatusDir(status);
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        const parsed = JSON.parse(await readFile(path.join(dir, entry.name), "utf8")) as unknown;
        assertTaskRecord(parsed);
        tasks.push(parsed);
      }
    }
    return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async readTask(id: string): Promise<TaskRecord> {
    const taskId = requireString(id, "task id");
    for (const status of TASK_STATUSES) {
      const filePath = path.join(this.taskStatusDir(status), `${taskId}.json`);
      try {
        const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
        assertTaskRecord(parsed);
        return parsed;
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Task not found: ${taskId}`);
  }

  private async writeTask(task: TaskRecord): Promise<void> {
    await writeJson(this.taskPath(task), task);
  }

  private taskPath(task: TaskRecord): string {
    return path.join(this.taskStatusDir(task.status), `${task.id}.json`);
  }

  private taskStatusDir(status: TaskStatus): string {
    return path.join(this.bridgeDir, "tasks", status);
  }

  private logPath(fileName: string): string {
    return path.join(this.bridgeDir, "logs", fileName);
  }

  private async ensureFile(filePath: string, content = ""): Promise<void> {
    try {
      await readFile(filePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await writeFile(filePath, content, "utf8");
        return;
      }
      throw error;
    }
  }

  private async appendJsonLine(filePath: string, value: object): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "a" });
  }

  private async readJsonLines<T>(
    filePath: string,
    assertRecord: (value: unknown) => asserts value is T
  ): Promise<T[]> {
    const raw = await readFile(filePath, "utf8");
    const rows: T[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as unknown;
      assertRecord(parsed);
      rows.push(parsed);
    }
    return rows;
  }
}

export async function initBridge(root: string): Promise<{ bridge: string }> {
  const store = new BridgeStore({ root });
  await store.init();
  return { bridge: store.bridgeDir };
}

export async function createTask(
  root: string,
  title: string,
  options: {
    dependencies?: string[];
    files?: string[];
    acceptanceCriteria?: string[];
    notes?: string;
    createdBy?: string;
  } = {}
): Promise<TaskRecord> {
  return new BridgeStore({ root }).createTask({
    title,
    body: options.notes,
    createdBy: options.createdBy,
    dependencies: options.dependencies,
    files: options.files,
    acceptanceCriteria: options.acceptanceCriteria
  });
}

export async function claimTask(root: string, id: string, agent: string, files: string[] = []): Promise<TaskRecord> {
  return new BridgeStore({ root }).claimTask({ id, agent, files });
}

export async function completeTask(root: string, id: string): Promise<TaskRecord> {
  return new BridgeStore({ root }).completeTask(id);
}

export async function listTasks(root: string): Promise<TaskRecord[]> {
  return new BridgeStore({ root }).listTasks();
}

export async function sendMessage(
  root: string,
  input: {
    sender: string;
    recipient: string;
    taskId?: string;
    intent?: MessageIntent;
    body: string;
    files?: string[];
  }
): Promise<MessageRecord> {
  return new BridgeStore({ root }).sendMessage({
    from: input.sender,
    recipient: input.recipient,
    taskId: input.taskId,
    intent: input.intent,
    body: input.body,
    files: input.files
  });
}

export async function createHandoff(
  root: string,
  input: {
    taskId: string;
    from: string;
    to?: string;
    summary: string;
    changedFiles?: string[];
    remainingWork?: string[];
    risks?: string[];
    verification?: string[];
  }
): Promise<HandoffRecord> {
  return new BridgeStore({ root }).handoff({
    taskId: input.taskId,
    from: input.from,
    to: requireString(input.to, "to"),
    summary: input.summary,
    changedFiles: input.changedFiles,
    remainingWork: input.remainingWork,
    risks: input.risks,
    verification: input.verification
  });
}

async function writeJson(filePath: string, value: object): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function removeIfExists(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function mergeLists(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second].map((item) => item.trim()).filter(Boolean))];
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sharedSkillText(): string {
  return `# Shared Agent Collaboration Skill

Use .agent-bridge as the source of truth when multiple agents work together.

1. Read .agent-bridge/context/*.md before claiming work.
2. Claim a task before editing files.
3. Write questions to the other agent's inbox when blocked.
4. Handoff with changed files, remaining work, risks, and verification.
5. Do not revert another agent's work without explicit human approval.
`;
}
