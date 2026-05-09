#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { MESSAGE_INTENTS, MessageIntent } from "./protocol.js";
import { BridgeStore } from "./store.js";
import { parseList } from "./validation.js";

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

const helpText = `agent-bridge

Commands:
  init
  task create "Title" [--created-by codex] [--files src/a.ts] [--acceptance "works,tests pass"]
  task claim TASK-ID --agent codex [--files src/a.ts]
  task done TASK-ID
  message send claude --from codex --body "Can you review this?"
  handoff TASK-ID --from codex --to claude --summary "API is ready"
  status

Global options:
  --root <path>   Project root, defaults to the current directory
`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const root = stringOption(parsed, "root", false);
  const store = new BridgeStore({ root });
  const [command, subcommand, maybeId, ...rest] = parsed.positionals;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(helpText);
    return;
  }

  if (command === "init") {
    await store.init();
    console.log(`Initialized ${store.bridgeDir}`);
    return;
  }

  if (command === "task" && subcommand === "create") {
    const title = stringOption(parsed, "title", false) ?? [maybeId, ...rest].filter(Boolean).join(" ");
    const task = await store.createTask({
      title,
      body: stringOption(parsed, "notes", false) ?? stringOption(parsed, "body", false),
      createdBy: stringOption(parsed, "created-by", false),
      files: parseList(stringOption(parsed, "files", false)),
      acceptanceCriteria: parseList(stringOption(parsed, "acceptance", false)),
      dependencies: parseList(stringOption(parsed, "depends", false))
    });
    console.log(`Created ${task.id}: ${task.title}`);
    return;
  }

  if (command === "task" && subcommand === "claim") {
    const task = await store.claimTask({
      id: requiredPositional(maybeId, "task id"),
      agent: stringOption(parsed, "agent", true),
      files: parseList(stringOption(parsed, "files", false))
    });
    console.log(`${task.id} claimed by ${task.owner}`);
    return;
  }

  if (command === "task" && subcommand === "done") {
    const task = await store.completeTask(requiredPositional(maybeId, "task id"));
    console.log(`${task.id} marked ${task.status}`);
    return;
  }

  if (command === "message" && subcommand === "send") {
    const message = await store.sendMessage({
      recipient: requiredPositional(maybeId, "recipient"),
      from: stringOption(parsed, "from", false) ?? "human",
      taskId: stringOption(parsed, "task", false),
      intent: parseIntent(stringOption(parsed, "intent", false)),
      body: stringOption(parsed, "body", false) ?? rest.join(" "),
      files: parseList(stringOption(parsed, "files", false))
    });
    console.log(`Sent ${message.id} to ${message.recipient}`);
    return;
  }

  if (command === "handoff") {
    const handoff = await store.handoff({
      taskId: requiredPositional(subcommand, "task id"),
      from: stringOption(parsed, "from", false) ?? "human",
      to: stringOption(parsed, "to", false) ?? "human",
      summary: stringOption(parsed, "summary", false) ?? stringOption(parsed, "body", false) ?? [maybeId, ...rest].filter(Boolean).join(" "),
      changedFiles: parseList(stringOption(parsed, "files", false)),
      remainingWork: parseList(stringOption(parsed, "remaining", false)),
      risks: parseList(stringOption(parsed, "risks", false)),
      verification: parseList(stringOption(parsed, "verification", false))
    });
    console.log(`Created ${handoff.id} for ${handoff.taskId}`);
    return;
  }

  if (command === "status") {
    const tasks = await store.listTasks();
    if (tasks.length === 0) {
      console.log("No tasks yet.");
      return;
    }
    for (const task of tasks) {
      const owner = task.owner ? ` @${task.owner}` : "";
      console.log(`${task.id} [${task.status}${owner}] ${task.title}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    if (equalsIndex !== -1) {
      options[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1);
      continue;
    }

    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = true;
    }
  }

  return { positionals, options };
}

function stringOption(parsed: ParsedArgs, name: string, required: true): string;
function stringOption(parsed: ParsedArgs, name: string, required: false): string | undefined;
function stringOption(parsed: ParsedArgs, name: string, required: boolean): string | undefined {
  const value = parsed.options[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (required) {
    throw new Error(`Missing required option --${name}`);
  }
  return undefined;
}

function requiredPositional(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

function parseIntent(value: string | undefined): MessageIntent {
  return MESSAGE_INTENTS.includes(value as MessageIntent) ? value as MessageIntent : "note";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent-bridge: ${message}`);
    process.exitCode = 1;
  });
}
