# agent-skill-bridge

A file-based coordination tool for Codex, Claude, and humans working in the same repository.

`agent-skill-bridge` gives agents a shared protocol they can use without a service, database, or hidden state. Tasks, inbox messages, conversations, shared plans, handoffs, presence, durable project context, and audit logs live in `.agent-bridge/`, where humans can read them and Git can diff them.

## What It Does

- Creates a shared `.agent-bridge/` workspace for multi-agent work.
- Tracks tasks through `open`, `claimed`, `blocked`, and `done`.
- Lets Codex, Claude, and humans send structured inbox messages.
- Adds task-linked conversations for back-and-forth planning.
- Adds shared plan files for multi-step work.
- Records agent presence/availability and supports a polling `listen` command.
- Records handoffs with changed files, remaining work, risks, and verification.
- Detects active file-claim conflicts before an agent takes ownership.
- Validates protocol files and JSONL logs with `agent-bridge validate`.
- Installs ready-to-use `AGENTS.md` and `CLAUDE.md` instruction sections.

## Install

From source:

```bash
npm install
npm run build
```

During development:

```bash
node dist/src/cli.js init
```

After publishing or linking:

```bash
agent-bridge init
```

To initialize the bridge and append the coordination instructions to `AGENTS.md` and `CLAUDE.md`:

```bash
agent-bridge init --install-templates
```

Template installation is additive. If an `## Agent Skill Bridge` section already exists, that file is skipped instead of overwritten.

## Bridge Layout

```text
.agent-bridge/
  inbox/
    codex/
    claude/
    human/
  tasks/
    open/
    claimed/
    blocked/
    done/
  context/
    project.md
    decisions.md
    constraints.md
  skills/
    shared/
    codex/
    claude/
  conversations/
    TASK-ID.jsonl
  plans/
    TASK-ID.md
  presence/
    codex.json
    claude.json
  listeners/
    .seen-codex.json
  logs/
    messages.jsonl
    tasks.jsonl
    handoffs.jsonl
```

The context files are the durable memory. The task directories are current state. Inbox files are addressed delivery. Conversations and plans are the shared planning room. Presence files advertise who is around. The logs are the audit trail.

## Common Commands

```bash
agent-bridge init --install-templates
agent-bridge task create "Build auth flow" --created-by human --files src/auth.ts --acceptance "login works,tests pass"
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts
agent-bridge message send claude --from codex --task TASK-ID --intent question --files src/auth.ts --body "Question: Can you review session expiry? Context: ..."
agent-bridge conversation append TASK-ID --from codex --intent proposal --files src/auth.ts --body "Proposal: ..."
agent-bridge plan write TASK-ID --from codex --body "Goal: ... Steps: ... Open questions: ..."
agent-bridge presence update --agent codex --task TASK-ID --status working --files src/auth.ts
agent-bridge listen --agent codex --once
agent-bridge handoff TASK-ID --from codex --to claude --summary "Auth helper is ready" --files src/auth.ts --remaining "wire UI" --risks "browser QA still needed" --verification "npm test"
agent-bridge status
agent-bridge validate
agent-bridge task done TASK-ID
```

Use `--root <path>` from outside the project directory:

```bash
agent-bridge --root /path/to/project status
```

## Conflict Detection

The bridge treats active file ownership as coordination data. When an agent claims a task or creates a handoff, the CLI checks the task's files against other `claimed` and `blocked` tasks.

A conflict is reported when the same normalized file path is active on more than one task and those tasks have different owners:

```text
File claim conflict: src/auth.ts is already claimed by claude, codex on TASK-...
```

`agent-bridge status` also prints existing conflicts:

```text
CONFLICT src/auth.ts: TASK-1, TASK-2 (codex, claude)
```

The goal is not to lock files forever. It is to make overlap explicit before one agent overwrites another agent's work.

## Conversations, Plans, And Presence

Use inbox messages for addressed work and task-linked conversations for planning:

```bash
agent-bridge conversation append TASK-ID --from claude --to codex --intent proposal --body "Proposal: split API and UI work."
```

Each conversation appends JSONL to `.agent-bridge/conversations/TASK-ID.jsonl`.

Use shared plans for multi-step work:

```bash
agent-bridge plan write TASK-ID --from codex --body "Goal: ...\nSteps: ...\nVerification: ..."
```

Plans live at `.agent-bridge/plans/TASK-ID.md`.

Use presence when agents need to know who is around:

```bash
agent-bridge presence update --agent codex --status working --task TASK-ID --files src/auth.ts --can-accept-work false
```

Presence lives at `.agent-bridge/presence/<agent>.json`.

For always-on monitoring, run:

```bash
agent-bridge listen --agent codex
```

`listen` polls the recipient inbox and prints new messages, marking actionable intents such as `hold`, `blocker`, `question`, `delegate`, `spawn_agents`, `review_request`, and `handoff`. It can be run by a terminal, supervisor, hook, or future daemon. A model prompt by itself cannot listen continuously; something outside the model has to keep the listener running and wake the agent/runtime.

## Safe `--force`

`--force` is available on:

```bash
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts --force
agent-bridge handoff TASK-ID --from codex --to claude --summary "..." --files src/auth.ts --force
```

Use it only after the overlap is intentional:

- the current owner handed the work over,
- both agents agreed in inbox messages,
- or a human approved the override.

`--force` bypasses the conflict guard for the claim or handoff. It does not merge source changes, rewrite another task, delete another inbox message, or imply approval to revert someone else's edits.

## Validation

Run validation before stopping shared work:

```bash
agent-bridge validate
```

Validation checks task records, message logs, handoff logs, task file placement, claimed-task ownership, missing acceptance criteria, and active file conflicts. It exits non-zero when protocol errors or active conflicts are present, so it can be used in CI or pre-handoff scripts.

## Codex And Claude Help Loop

The intended loop is simple:

1. A human or agent creates a task with files and acceptance criteria.
2. Codex claims implementation-heavy work and names the files it expects to edit.
3. Agents use `conversation append` and `plan write` to negotiate the plan when work is substantial.
4. Codex asks Claude focused questions or requests review through `message send`.
5. Claude replies with structured guidance, review findings, delegation, or a handoff.
6. Either agent can request helper agents with `spawn_agents`; the receiver accepts, rejects, or counters before acting.
7. The owning agent records durable decisions in `.agent-bridge/context/decisions.md`.
8. Ownership changes through `handoff`, including remaining work, risks, and verification.
9. The final owner runs verification, validates the bridge, and marks the task done.

This keeps the human out of the message-bus role while keeping the human in charge of decisions and conflict resolution.

## Documentation

- [docs/protocol.md](docs/protocol.md) defines the `.agent-bridge/` file layout, record shapes, conflict rules, and validation behavior.
- [examples/demo-workflow.md](examples/demo-workflow.md) walks through a practical Codex and Claude collaboration loop.
- [templates/AGENTS.md](templates/AGENTS.md) provides Codex-ready instructions.
- [templates/CLAUDE.md](templates/CLAUDE.md) provides Claude-ready instructions.

## Collaboration Rules

Agents should treat `.agent-bridge/` as the coordination source of truth:

1. Read `.agent-bridge/context/*.md`.
2. Claim a task before editing files.
3. Use conversations and plans for shared reasoning.
4. Message the other agent when blocked, uncertain, delegating, asking for review, or ready for handoff.
5. Treat `hold`, `blocker`, `question`, `delegate`, `spawn_agents`, `review_request`, and `handoff` as actionable immediately.
6. Handoff with changed files, remaining work, risks, and verification.
7. Do not revert another agent's work without human approval.
8. Put durable decisions in `.agent-bridge/context/decisions.md`.
9. Run `agent-bridge validate` before stopping.
