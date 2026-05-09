# Protocol

`agent-skill-bridge` uses plain files under `.agent-bridge/`.

## Task

Tasks live in `.agent-bridge/tasks/{status}/TASK-ID.json`.

```json
{
  "id": "TASK-20260509123000-abc123",
  "title": "Build auth flow",
  "status": "claimed",
  "owner": "codex",
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

## Message

Messages live in `.agent-bridge/inbox/{recipient}/`.

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
- `handoff`
- `status`
- `blocked`
- `note`

## Handoff

Handoffs are appended to `.agent-bridge/logs/handoffs.jsonl`.

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

## Human Authority

The protocol helps agents coordinate. It does not make decisions for the human. If Codex and Claude disagree, they should write both recommendations and ask the human to choose.

## Lifecycle

1. Read `.agent-bridge/context/*.md` before taking work.
2. Create a task or inspect existing task records.
3. Claim the task before editing files.
4. Send `question`, `blocked`, or `review` messages when another agent's help would reduce risk.
5. Use a handoff when ownership changes or when a different agent should continue.
6. Mark the task `done` only after acceptance criteria are satisfied.

## Concurrency Rules

- Do not delete or rewrite another agent's inbox records.
- Do not revert another agent's source edits without explicit human approval.
- If two agents need the same files, send a status message naming the overlap.
- If an agent is stuck, it should leave enough context in the message body for the other agent to continue.
- Durable decisions should be summarized in `.agent-bridge/context/decisions.md`, not left only in inbox messages.

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

For `handoff`, prefer the dedicated `agent-bridge handoff` command so changed files, remaining work, risks, and verification are structured.
