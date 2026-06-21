export const BRIDGE_DIR = ".agent-bridge";
export const PROTOCOL_VERSION = 1;

export const TASK_STATUSES = ["open", "claimed", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MESSAGE_INTENTS = [
  "question",
  "answer",
  "review",
  "review_request",
  "handoff",
  "status",
  "blocked",
  "blocker",
  "note",
  "proposal",
  "accept",
  "reject",
  "decision",
  "request",
  "delegate",
  "spawn_agents",
  "hold"
] as const;
export type MessageIntent = (typeof MESSAGE_INTENTS)[number];

export const ACTIONABLE_MESSAGE_INTENTS = [
  "question",
  "review",
  "review_request",
  "blocked",
  "blocker",
  "delegate",
  "spawn_agents",
  "hold",
  "handoff"
] as const satisfies readonly MessageIntent[];

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  owner?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  dependencies: string[];
  files: string[];
  acceptanceCriteria: string[];
  notes: string;
}

export interface MessageRecord {
  id: string;
  taskId?: string;
  sender: string;
  recipient: string;
  intent: MessageIntent;
  body: string;
  createdAt: string;
  files: string[];
}

export interface ConversationRecord {
  id: string;
  taskId: string;
  sender: string;
  recipient?: string;
  room?: string;
  intent: MessageIntent;
  body: string;
  createdAt: string;
  files: string[];
}

export interface HandoffRecord {
  id: string;
  taskId: string;
  from: string;
  to: string;
  summary: string;
  changedFiles: string[];
  remainingWork: string[];
  risks: string[];
  verification: string[];
  createdAt: string;
}

export interface PresenceRecord {
  agent: string;
  status: string;
  taskId?: string;
  files: string[];
  canAcceptWork: boolean;
  lastSeen: string;
}

export interface InboxMessage {
  fileName: string;
  message: MessageRecord;
}

export interface StatusSnapshot {
  root: string;
  bridgeDir: string;
  tasks: Record<TaskStatus, number> & { total: number };
  conflicts: ConflictRecord[];
  latestMessages: MessageRecord[];
  latestHandoffs: HandoffRecord[];
}

export interface ConflictRecord {
  file: string;
  taskIds: string[];
  owners: string[];
}

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  conflicts: ConflictRecord[];
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: "TASK" | "MSG" | "HANDOFF" | "CONVO", date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

export function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireValue(value: string, name: string): string {
  if (!value.trim()) {
    throw new ProtocolError(`${name} is required`);
  }
  return value.trim();
}
