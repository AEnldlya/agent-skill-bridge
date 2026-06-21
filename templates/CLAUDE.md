# Agent Bridge Instructions For Claude

Use `.agent-bridge/` as the coordination source of truth when collaborating with Codex, helper agents, or humans. Treat it as a planning room, not only an inbox.

## Read Before Acting

Before starting shared work, inspect:

- `.agent-bridge/context/project.md` for product and repo context.
- `.agent-bridge/context/constraints.md` for boundaries, ownership notes, and files to avoid.
- `.agent-bridge/context/decisions.md` for durable human-approved decisions.
- `.agent-bridge/tasks/open/`, `.agent-bridge/tasks/claimed/`, and `.agent-bridge/tasks/blocked/` for task state.
- `.agent-bridge/inbox/claude/` for questions, answers, holds, reviews, handoffs, and delegation from Codex.
- `.agent-bridge/conversations/`, `.agent-bridge/plans/`, and `.agent-bridge/presence/` when work is substantial or shared.

## Claim Work

Claim a task before editing files:

```bash
agent-bridge task claim TASK-ID --agent claude --files src/file.ts,test/file.test.ts
```

If the claim reports a file conflict, pause and coordinate with Codex or the human. Use `--force` only after the overlap is intentional and approved by a handoff, inbox agreement, or human instruction.

## Plan Together

Use task-linked conversations for back-and-forth planning:

```bash
agent-bridge conversation append TASK-ID \
  --from claude \
  --intent proposal \
  --files src/file.ts,test/file.test.ts \
  --body "Proposal: ... Risks: ... Verification: ..."
```

Use a shared plan for multi-step work:

```bash
agent-bridge plan write TASK-ID --from claude --body "Goal: ...; Steps: ...; Open questions: ..."
```

Update presence when it helps the other agent know whether Claude is available:

```bash
agent-bridge presence update --agent claude --task TASK-ID --status working --files src/file.ts
```

## Ask Codex For Help

Use specific intents: `question`, `answer`, `proposal`, `accept`, `reject`, `decision`, `request`, `delegate`, `spawn_agents`, `review_request`, `blocker`, `hold`, `handoff`, `status`, and `note`. Prefer `review_request` over legacy `review`, and `blocker` over legacy `blocked`, for new messages.

Treat `hold`, `blocked`, `blocker`, `question`, `delegate`, `spawn_agents`, `review`, `review_request`, and `handoff` as immediately actionable.

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent question \
  --files src/file.ts,test/file.test.ts \
  --body "Question: ... Context: ... What I tried: ... Needed from you: ..."
```

Ask Codex to spawn helper agents when parallel work would help:

```bash
agent-bridge message send codex --from claude --task TASK-ID --intent spawn_agents \
  --body "Goal: ... Count: ... Scopes: ... Expected output: ..."
```

## Always Listening

Prompts alone cannot make agents always listen; a watcher, hook, daemon, or terminal process must wake the agent/runtime. Use the listener when an external supervisor can keep it running:

```bash
agent-bridge listen --agent claude
```

## Handoff To Codex

Use a handoff when Codex should continue, implement, verify, or take ownership:

```bash
agent-bridge handoff TASK-ID \
  --from claude \
  --to codex \
  --summary "What changed and why." \
  --files src/file.ts,test/file.test.ts \
  --remaining "Specific next step for Codex" \
  --risks "Known risk or uncertainty" \
  --verification "Command run and result"
```

`--force` on handoff bypasses conflict detection only for an intentional overlap. It does not merge source changes, delete another task, or permit reverting another agent's work.

## Coordination Rules

- Do not erase Codex inbox artifacts or task records.
- Do not assume hidden chat context will survive. Put important state in bridge files.
- If Codex owns a file, do not overwrite it without a handoff, an inbox agreement, or human approval.
- Before pushing, deploying, or taking destructive actions, check for fresh `hold`, `blocker`, and `review_request` messages.
- Keep bridge notes short, factual, and tied to repo files.
- Put durable conclusions in `.agent-bridge/context/decisions.md`.
- Continue to follow normal source control hygiene for code changes.

## Before Stopping

Run:

```bash
agent-bridge validate
```

Resolve protocol errors and active conflicts before stopping when possible. Update the conversation or plan, and create a handoff with changed files, remaining work, risks, and verification if another agent or future session should continue.
