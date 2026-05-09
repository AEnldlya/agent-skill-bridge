import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BRIDGE_DIR,
  ConflictRecord,
  HandoffRecord,
  makeId,
  MessageIntent,
  MessageRecord,
  nowIso,
  StatusSnapshot,
  TASK_STATUSES,
  TaskRecord,
  TaskStatus,
  ValidationReport
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
  force?: boolean;
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
  force?: boolean;
}

export interface TemplateInstallResult {
  installed: string[];
  skipped: string[];
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
    const owner = requireString(input.agent, "agent");
    const files = mergeLists(task.files, input.files ?? []);
    if (!input.force) {
      const conflicts = await this.findConflictsForFiles(files, task.id, owner);
      if (conflicts.length > 0) {
        throw new Error(formatConflictError(conflicts));
      }
    }
    task.status = "claimed";
    task.owner = owner;
    task.files = files;
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
    const to = requireString(input.to, "to");
    const files = mergeLists(task.files, input.changedFiles ?? []);
    if (!input.force) {
      const conflicts = await this.findConflictsForFiles(files, task.id, to);
      if (conflicts.length > 0) {
        throw new Error(formatConflictError(conflicts));
      }
    }
    const handoff: HandoffRecord = {
      id: makeId("HANDOFF"),
      taskId: task.id,
      from: requireString(input.from, "from"),
      to,
      summary: requireString(input.summary, "summary"),
      changedFiles: input.changedFiles ?? [],
      remainingWork: input.remainingWork ?? [],
      risks: input.risks ?? [],
      verification: input.verification ?? [],
      createdAt: nowIso()
    };
    assertHandoffRecord(handoff);
    task.owner = handoff.to;
    task.files = files;
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
      conflicts: findTaskConflicts(tasks),
      latestMessages: (await this.readJsonLines(this.logPath("messages.jsonl"), assertMessageRecord)).slice(-5),
      latestHandoffs: (await this.readJsonLines(this.logPath("handoffs.jsonl"), assertHandoffRecord)).slice(-5)
    };
  }

  async findConflicts(): Promise<ConflictRecord[]> {
    return findTaskConflicts(await this.listTasks());
  }

  async validate(): Promise<ValidationReport> {
    await this.init();
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const status of TASK_STATUSES) {
      const dir = this.taskStatusDir(status);
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const filePath = path.join(dir, entry.name);
        try {
          const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
          assertTaskRecord(parsed);
          if (parsed.status !== status) {
            errors.push(`${filePath}: task.status is ${parsed.status}, but file is under ${status}`);
          }
        } catch (error) {
          errors.push(`${filePath}: ${formatUnknownError(error)}`);
        }
      }
    }

    await this.validateJsonLines("messages.jsonl", assertMessageRecord, errors);
    await this.validateJsonLines("handoffs.jsonl", assertHandoffRecord, errors);

    const tasks = await this.listTasks().catch((error: unknown) => {
      errors.push(formatUnknownError(error));
      return [];
    });
    for (const task of tasks) {
      if (task.status === "claimed" && !task.owner) {
        errors.push(`${task.id}: claimed task must have an owner`);
      }
      if (task.acceptanceCriteria.length === 0) {
        warnings.push(`${task.id}: no acceptance criteria recorded`);
      }
    }

    const conflicts = findTaskConflicts(tasks);
    for (const conflict of conflicts) {
      warnings.push(`${conflict.file}: claimed by ${conflict.taskIds.join(", ")} across ${conflict.owners.join(", ")}`);
    }

    return {
      ok: errors.length === 0 && conflicts.length === 0,
      errors,
      warnings,
      conflicts
    };
  }

  async installTemplates(): Promise<TemplateInstallResult> {
    await this.init();
    const installed: string[] = [];
    const skipped: string[] = [];
    const templates: Array<{ file: string; marker: string; body: string }> = [
      { file: "AGENTS.md", marker: "## Agent Skill Bridge", body: agentsTemplateText() },
      { file: "CLAUDE.md", marker: "## Agent Skill Bridge", body: claudeTemplateText() }
    ];

    for (const template of templates) {
      const filePath = path.join(this.root, template.file);
      let existing = "";
      try {
        existing = await readFile(filePath, "utf8");
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      }

      if (existing.includes(template.marker)) {
        skipped.push(template.file);
        continue;
      }

      const next = existing.trim().length > 0
        ? `${existing.replace(/\s+$/, "")}\n\n${template.body}`
        : `${template.body}\n`;
      await writeFile(filePath, next, "utf8");
      installed.push(template.file);
    }

    return { installed, skipped };
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

  private async validateJsonLines<T>(
    fileName: string,
    assertRecord: (value: unknown) => asserts value is T,
    errors: string[]
  ): Promise<void> {
    const filePath = this.logPath(fileName);
    const raw = await readFile(filePath, "utf8");
    let lineNumber = 0;
    for (const line of raw.split(/\r?\n/)) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        assertRecord(parsed);
      } catch (error) {
        errors.push(`${filePath}:${lineNumber}: ${formatUnknownError(error)}`);
      }
    }
  }

  private async findConflictsForFiles(files: string[], currentTaskId: string, currentOwner: string): Promise<ConflictRecord[]> {
    const pseudoTask: TaskRecord = {
      id: currentTaskId,
      title: "pending claim",
      status: "claimed",
      owner: currentOwner,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      dependencies: [],
      files,
      acceptanceCriteria: [],
      notes: ""
    };
    const otherTasks = (await this.listTasks()).filter((task) => task.id !== currentTaskId);
    return findTaskConflicts([...otherTasks, pseudoTask]).filter((conflict) => conflict.taskIds.includes(currentTaskId));
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

export async function claimTask(root: string, id: string, agent: string, files: string[] = [], force = false): Promise<TaskRecord> {
  return new BridgeStore({ root }).claimTask({ id, agent, files, force });
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
    force?: boolean;
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
    verification: input.verification,
    force: input.force
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

function findTaskConflicts(tasks: TaskRecord[]): ConflictRecord[] {
  const byFile = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    if (task.status !== "claimed" && task.status !== "blocked") continue;
    for (const file of task.files) {
      const normalized = normalizeFile(file);
      if (!normalized) continue;
      byFile.set(normalized, [...(byFile.get(normalized) ?? []), task]);
    }
  }

  const conflicts: ConflictRecord[] = [];
  for (const [file, fileTasks] of byFile) {
    const activeOwners = new Set(fileTasks.map((task) => task.owner ?? "unowned"));
    if (fileTasks.length > 1 && activeOwners.size > 1) {
      conflicts.push({
        file,
        taskIds: fileTasks.map((task) => task.id),
        owners: [...activeOwners]
      });
    }
  }
  return conflicts.sort((a, b) => a.file.localeCompare(b.file));
}

function normalizeFile(file: string): string {
  return file.trim().replace(/\\/g, "/");
}

function formatConflictError(conflicts: ConflictRecord[]): string {
  const details = conflicts
    .map((conflict) => `${conflict.file} is already claimed by ${conflict.owners.join(", ")} on ${conflict.taskIds.join(", ")}`)
    .join("; ");
  return `File claim conflict: ${details}. Use --force only after the agents agree or a human approves.`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function agentsTemplateText(): string {
  return `## Agent Skill Bridge

Use \`.agent-bridge\` as the coordination source of truth when collaborating with Claude or another agent.

Before editing:

1. Read \`.agent-bridge/context/project.md\`.
2. Read \`.agent-bridge/context/constraints.md\`.
3. Check \`.agent-bridge/inbox/codex/\` for questions, answers, reviews, and handoffs.
4. Check \`.agent-bridge/tasks/open/\`, \`.agent-bridge/tasks/claimed/\`, and \`.agent-bridge/tasks/blocked/\`.
5. Claim your task with \`agent-bridge task claim TASK-ID --agent codex --files path/to/file\`.

During work:

- If blocked, send Claude a structured question with \`agent-bridge message send claude --from codex --intent question --task TASK-ID --body "Question: ... Context: ... What I tried: ... Needed from you: ..."\`.
- If handing off, use \`agent-bridge handoff TASK-ID --from codex --to claude --summary "..." --files path/to/file --remaining "..." --risks "..." --verification "..."\`.
- If Claude owns a file, do not overwrite it without a handoff or human approval.
- Run \`agent-bridge validate\` before stopping.

Before stopping:

- Create a handoff with changed files, remaining work, risks, and verification.
- Mark the task done only when acceptance criteria are satisfied.
`;
}

function claudeTemplateText(): string {
  return `## Agent Skill Bridge

Use \`.agent-bridge\` as the coordination source of truth when collaborating with Codex or another agent.

Before editing:

1. Read \`.agent-bridge/context/project.md\`.
2. Read \`.agent-bridge/context/constraints.md\`.
3. Check \`.agent-bridge/inbox/claude/\` for questions, answers, reviews, and handoffs.
4. Check \`.agent-bridge/tasks/open/\`, \`.agent-bridge/tasks/claimed/\`, and \`.agent-bridge/tasks/blocked/\`.
5. Claim your task with \`agent-bridge task claim TASK-ID --agent claude --files path/to/file\`.

During work:

- If blocked, send Codex a structured question with \`agent-bridge message send codex --from claude --intent question --task TASK-ID --body "Question: ... Context: ... What I tried: ... Needed from you: ..."\`.
- If reviewing Codex work, send \`agent-bridge message send codex --from claude --intent review --task TASK-ID --body "Findings: ... Questions: ... Test gaps: ... Summary: ..."\`.
- If Codex owns a file, do not overwrite it without a handoff or human approval.
- Run \`agent-bridge validate\` before stopping.

Before stopping:

- Create a handoff with changed files, remaining work, risks, and verification.
- Mark the task done only when acceptance criteria are satisfied.
`;
}
