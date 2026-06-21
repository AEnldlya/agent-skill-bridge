# Protocol

`agent-skill-bridge` uses plain files under `.agent-bridge/`. The protocol is intentionally boring: JSON task records for current state, JSON inbox records for agent-to-agent messages, JSONL conversations for planning, Markdown plans for multi-step work, JSON presence files for availability, JSONL logs for history, and Markdown context files for decisions humans and agents need later.

## Directory Layout

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

## Task Records

Tasks live in `.agent-bridge/tasks/{status}/TASK-ID.json`.

```json
{
  "id": "TASK-20260509123000-abc123",
  "title": "Build auth flow",
  "status": "claimed",
  "owner": "codex",
  "createdBy": "human",
  "createdAt": "2026-05-09T12:30:00.000Z",
  "updatedAt": "2026-05-09T12:35:00.000Z",
  "dependencies": [],
  "files": ["src/auth.ts"],
  "acceptanceCriteria": ["login works", "tests pass"],
  "notes": "Use existing session helpers."
}
```

Valid statuses:

- `open`
- `claimed`
- `blocked`
- `done`

Claimed tasks should have an `owner`. The `files` list is the coordination surface for conflict detection, so agents should name files they expect to edit or review closely.

## Message Records

Messages live in `.agent-bridge/inbox/{recipient}/` and are appended to `.agent-bridge/logs/messages.jsonl`.

```json
{
  "id": "MSG-20260509124000-def456",
  "taskId": "TASK-20260509123000-abc123",
  "sender": "codex",
  "recipient": "claude",
  "intent": "question",
  "body": "Can you review the session expiry path?",
  "createdAt": "2026-05-09T12:40:00.000Z",
  "files": ["src/auth.ts"]
}
```

Valid intents:

- `question`
- `answer`
- `review`
- `review_request`
- `handoff`
- `status`
- `blocked`
- `blocker`
- `note`
- `proposal`
- `accept`
- `reject`
- `decision`
- `request`
- `delegate`
- `spawn_agents`
- `hold`

Inbox records are addressed work items. Logs are history. Agents should not delete or rewrite another agent's inbox records.

Treat `hold`, `blocked`, `blocker`, `question`, `delegate`, `spawn_agents`, `review`, `review_request`, and `handoff` as actionable immediately.

## Conversation Records

Conversations are append-only task-linked JSONL files at `.agent-bridge/conversations/TASK-ID.jsonl`. Use them when agents need to compare options, negotiate ownership, tell each other what to do, request helper agents, or plan together.

```json
{
  "id": "CONVO-20260509124500-jkl012",
  "taskId": "TASK-20260509123000-abc123",
  "sender": "codex",
  "recipient": "claude",
  "room": "TASK-20260509123000-abc123",
  "intent": "proposal",
  "body": "Proposal: Codex owns API, Claude reviews UX copy.",
  "createdAt": "2026-05-09T12:45:00.000Z",
  "files": ["src/auth.ts"]
}
```

Append through:

```bash
agent-bridge conversation append TASK-ID --from codex --to claude --intent proposal --body "Proposal: ..."
```

## Plan Files

Plans are Markdown files at `.agent-bridge/plans/TASK-ID.md`. Use them for multi-step shared work.

Recommended sections:

- Goal and acceptance criteria.
- Current owner and supporting agents.
- Step list with status.
- Files and boundaries.
- Open questions.
- Decisions made.
- Blockers and escalation owner.
- Verification required before done.

Write or replace a plan through:

```bash
agent-bridge plan write TASK-ID --from codex --body "Goal: ...; Steps: ...; Verification: ..."
```

In PowerShell, use a backtick newline such as `` `n `` or a here-string when you want multi-line plan text.

## Presence Records

Presence files live at `.agent-bridge/presence/<agent>.json`.

```json
{
  "agent": "codex",
  "status": "working",
  "taskId": "TASK-20260509123000-abc123",
  "files": ["src/auth.ts"],
  "canAcceptWork": false,
  "lastSeen": "2026-05-09T12:50:00.000Z"
}
```

Update presence through:

```bash
agent-bridge presence update --agent codex --task TASK-ID --status working --files src/auth.ts --can-accept-work false
```

## Handoff Records

Handoffs are appended to `.agent-bridge/logs/handoffs.jsonl`. A handoff also moves task ownership to the receiving agent and writes a `handoff` message into the receiver inbox so `agent-bridge listen` can wake on the transfer.

```json
{
  "id": "HANDOFF-20260509130000-ghi789",
  "taskId": "TASK-20260509123000-abc123",
  "from": "codex",
  "to": "claude",
  "summary": "API route is implemented and tests pass.",
  "changedFiles": ["src/auth.ts", "test/auth.test.ts"],
  "remainingWork": ["Wire UI form"],
  "risks": ["Session refresh still needs browser QA"],
  "verification": ["npm test"],
  "createdAt": "2026-05-09T13:00:00.000Z"
}
```

Use handoffs when another agent should continue, review, verify, or take ownership. Prefer the CLI so changed files, remaining work, risks, and verification are structured.

A task has one active owner. For true parallel slices, create separate tasks per owner and coordinate them through the shared conversation or plan.

## Conflict Detection

Conflict detection compares active tasks by file path. A task is active when its status is `claimed` or `blocked`.

A conflict exists when:

- two or more active tasks list the same normalized file path, and
- those tasks have different owners.

Paths are normalized by trimming whitespace and converting backslashes to forward slashes. Conflict detection is intentionally about coordination, not source control. It does not inspect Git diffs and it does not merge code.

Commands that check conflicts:

```bash
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts
agent-bridge handoff TASK-ID --from codex --to claude --summary "..." --files src/auth.ts
agent-bridge status
agent-bridge validate
```

`task claim` and `handoff` fail on a new conflict unless `--force` is supplied. `status` prints current conflicts. `validate` treats active conflicts as invalid bridge state and exits non-zero.

## Safe `--force` Semantics

`--force` is a coordination override, not a source-control override.

Allowed use:

- the current owner has handed off the file,
- both agents have agreed in messages,
- or a human has approved the overlap.

What `--force` does:

- bypasses conflict detection for that claim or handoff,
- records the updated task owner/files,
- keeps existing messages, logs, and other task records intact.

What `--force` does not do:

- merge source changes,
- delete or edit another task,
- delete or edit another inbox message,
- give permission to revert another agent's work,
- resolve the underlying collaboration risk.

After using `--force`, send a `status` message or record a handoff note explaining why the overlap is intentional.

## Validate Command

Run:

```bash
agent-bridge validate
```

Validation checks:

- task JSON records are well-formed,
- task files live under the directory matching their `status`,
- `messages.jsonl` contains valid message records,
- `handoffs.jsonl` contains valid handoff records,
- conversation JSONL files contain valid conversation records,
- presence JSON files contain valid presence records,
- claimed tasks have owners,
- tasks without acceptance criteria are called out as warnings,
- active file conflicts are reported.

Validation prints `ERROR` lines for malformed protocol data and `WARN` lines for coordination risks. The command exits with a non-zero status when there are errors or active conflicts.

## Human Authority

The protocol helps agents coordinate. It does not make decisions for the human. If Codex and Claude disagree, they should write both recommendations and ask the human to choose.

Human-approved decisions that future sessions need should be summarized in `.agent-bridge/context/decisions.md`, not left only in chat or inbox messages.

## Always Listening

Models do not continuously listen on their own. Always-on behavior requires a watcher, hook, terminal process, supervisor, or daemon outside the model.

The built-in listener polls a recipient inbox and prints new messages:

```bash
agent-bridge listen --agent codex
agent-bridge listen --agent claude --once
```

The listener stores cursor files in `.agent-bridge/listeners/`. It marks actionable intents in output so an external runtime can wake the right agent for `hold`, `blocked`, `blocker`, `question`, `delegate`, `spawn_agents`, `review`, `review_request`, and `handoff`.

## Lifecycle

1. Read `.agent-bridge/context/*.md` before taking work.
2. Create a task or inspect existing task records.
3. Claim the task before editing files.
4. Use `conversation append` and `plan write` for substantial shared planning.
5. Send `question`, `blocked`, `blocker`, `status`, `delegate`, `spawn_agents`, `review`, or `review_request` messages when another agent's help would reduce risk.
6. Use a handoff when ownership changes or when a different agent should continue.
7. Run `agent-bridge validate`.
8. Mark the task `done` only after acceptance criteria are satisfied.

## Codex And Claude Help Loop

The intended collaboration loop is:

1. Codex handles concrete implementation, repo edits, test runs, and verification.
2. Claude helps with reasoning, review, architecture questions, writing, or second-opinion checks.
3. Either agent can ask the other for help through an inbox message tied to the task and files.
4. Either agent can propose plans, accept or reject delegation, and request helper agents.
5. Either agent can hand work off with structured remaining work, risks, and verification.
6. Both agents keep important conclusions in bridge files so future sessions inherit the context.

This loop is a convention, not a hard role limit. The task owner is responsible for naming the files they touch, requesting help early, and leaving enough state for the next actor.

## Recommended Message Body Shapes

For `question`:

```text
Question: ...
Context: ...
What I tried: ...
Needed from you: ...
```

For `answer`:

```text
Short answer: ...
Reasoning: ...
Suggested next steps: ...
Confidence: ...
```

For `review`:

```text
Findings: ...
Questions: ...
Test gaps: ...
Summary: ...
```

For `status`:

```text
Current state: ...
Files I own: ...
Next step: ...
Blocking risk: ...
```

For `handoff`, prefer the dedicated `agent-bridge handoff` command.

For `spawn_agents`:

```text
Goal: ...
Count: ...
Scopes: ...
Expected output: ...
```

For `delegate`:

```text
Goal: ...
Scope/files: ...
Acceptance: ...
Expected owner: ...
Verification: ...
```

Delegation is a request, not ownership transfer. The receiver replies with `accept`, `reject`, `proposal`, or `question`; accepted work should create or claim a task, or use `handoff` when ownership changes.

For `proposal`:

```text
Proposal: ...
Tradeoffs: ...
Files: ...
Verification: ...
Needed decision: ...
```
