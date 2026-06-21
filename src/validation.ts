import {
  ConversationRecord,
  HandoffRecord,
  MESSAGE_INTENTS,
  MessageRecord,
  PresenceRecord,
  PROTOCOL_VERSION,
  ProtocolError,
  TASK_STATUSES,
  TaskRecord
} from "./protocol.js";

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProtocolError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assertTaskRecord(value: unknown): asserts value is TaskRecord {
  const record = asObject(value, "task");
  requireString(record.id, "task.id");
  requireString(record.title, "task.title");
  requireString(record.createdAt, "task.createdAt");
  requireString(record.updatedAt, "task.updatedAt");

  if (typeof record.status !== "string" || !TASK_STATUSES.includes(record.status as never)) {
    throw new ProtocolError(`task.status must be one of ${TASK_STATUSES.join(", ")}`);
  }
  if (record.owner !== undefined) requireString(record.owner, "task.owner");
  if (record.createdBy !== undefined) requireString(record.createdBy, "task.createdBy");
  assertStringArray(record.dependencies, "task.dependencies");
  assertStringArray(record.files, "task.files");
  assertStringArray(record.acceptanceCriteria, "task.acceptanceCriteria");
  if (typeof record.notes !== "string") {
    throw new ProtocolError("task.notes must be a string");
  }
}

export function assertMessageRecord(value: unknown): asserts value is MessageRecord {
  const record = asObject(value, "message");
  requireString(record.id, "message.id");
  if (record.taskId !== undefined) requireString(record.taskId, "message.taskId");
  requireString(record.sender, "message.sender");
  requireString(record.recipient, "message.recipient");
  requireString(record.body, "message.body");
  requireString(record.createdAt, "message.createdAt");
  if (typeof record.intent !== "string" || !MESSAGE_INTENTS.includes(record.intent as never)) {
    throw new ProtocolError(`message.intent must be one of ${MESSAGE_INTENTS.join(", ")}`);
  }
  assertStringArray(record.files, "message.files");
}

export function assertConversationRecord(value: unknown): asserts value is ConversationRecord {
  const record = asObject(value, "conversation");
  requireString(record.id, "conversation.id");
  requireString(record.taskId, "conversation.taskId");
  requireString(record.sender, "conversation.sender");
  if (record.recipient !== undefined) requireString(record.recipient, "conversation.recipient");
  if (record.room !== undefined) requireString(record.room, "conversation.room");
  requireString(record.body, "conversation.body");
  requireString(record.createdAt, "conversation.createdAt");
  if (typeof record.intent !== "string" || !MESSAGE_INTENTS.includes(record.intent as never)) {
    throw new ProtocolError(`conversation.intent must be one of ${MESSAGE_INTENTS.join(", ")}`);
  }
  assertStringArray(record.files, "conversation.files");
}

export function assertHandoffRecord(value: unknown): asserts value is HandoffRecord {
  const record = asObject(value, "handoff");
  requireString(record.id, "handoff.id");
  requireString(record.taskId, "handoff.taskId");
  requireString(record.from, "handoff.from");
  requireString(record.to, "handoff.to");
  requireString(record.summary, "handoff.summary");
  assertStringArray(record.changedFiles, "handoff.changedFiles");
  assertStringArray(record.remainingWork, "handoff.remainingWork");
  assertStringArray(record.risks, "handoff.risks");
  assertStringArray(record.verification, "handoff.verification");
  requireString(record.createdAt, "handoff.createdAt");
}

export function assertPresenceRecord(value: unknown): asserts value is PresenceRecord {
  const record = asObject(value, "presence");
  requireString(record.agent, "presence.agent");
  requireString(record.status, "presence.status");
  if (record.taskId !== undefined) requireString(record.taskId, "presence.taskId");
  assertStringArray(record.files, "presence.files");
  if (typeof record.canAcceptWork !== "boolean") {
    throw new ProtocolError("presence.canAcceptWork must be a boolean");
  }
  requireString(record.lastSeen, "presence.lastSeen");
}

export function assertProtocolVersion(value: unknown): void {
  if (value !== PROTOCOL_VERSION) {
    throw new ProtocolError(`protocolVersion must be ${PROTOCOL_VERSION}`);
  }
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertStringArray(value: unknown, name: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProtocolError(`${name} must be an array of strings`);
  }
}
