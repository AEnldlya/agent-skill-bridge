# Agent Bridge Instructions For Codex

Use `.agent-bridge/` as the coordination source of truth when collaborating with Claude, another agent, or a human across tasks, sessions, or uncertainty.

## Read Before Acting

Before starting shared work, inspect:

- `.agent-bridge/context/project.md` for product and repo context.
- `.agent-bridge/context/constraints.md` for boundaries, ownership notes, and files to avoid.
- `.agent-bridge/context/decisions.md` for durable human-approved decisions.
- `.agent-bridge/tasks/open/`, `.agent-bridge/tasks/claimed/`, and `.agent-bridge/tasks/blocked/` for task state.
- `.agent-bridge/inbox/codex/` for questions, answers, reviews, handoffs, and status messages addressed to Codex.

## Claim Work

Claim a task before editing files:

```bash
agent-bridge task claim TASK-ID --agent codex --files src/file.ts,test/file.test.ts
```

If the claim reports a file conflict, pause and coordinate with Claude or the human. Use `--force` only after the overlap is intentional and approved by a handoff, inbox agreement, or human instruction.

## Ask Claude For Help

Use Claude for focused review, reasoning, design tradeoffs, debugging hypotheses, writing, or a second opinion:

```bash
agent-bridge message send claude \
  --from codex \
  --task TASK-ID \
  --intent question \
  --files src/file.ts,test/file.test.ts \
  --body "Question: ... Context: ... What I tried: ... Needed from you: ..."
```

For review:

```bash
agent-bridge message send claude \
  --from codex \
  --task TASK-ID \
  --intent review \
  --files src/file.ts,test/file.test.ts \
  --body "Findings: ... Questions: ... Test gaps: ... Summary: ..."
```

## Handoff To Claude

Use a handoff when Claude should continue, review, verify, or take ownership:

```bash
agent-bridge handoff TASK-ID \
  --from codex \
  --to claude \
  --summary "What changed and why." \
  --files src/file.ts,test/file.test.ts \
  --remaining "Specific next step for Claude" \
  --risks "Known risk or uncertainty" \
  --verification "Command run and result"
```

`--force` on handoff bypasses conflict detection only for an intentional overlap. It does not merge source changes, delete another task, or permit reverting another agent's work.

## Coordination Rules

- Do not erase Claude's inbox artifacts or task records.
- Do not assume hidden chat context will survive. Put important state in bridge files.
- If Claude owns a file, do not overwrite it without a handoff, an inbox agreement, or human approval.
- When accepting a Claude handoff, claim the task or send a `status` message to Claude.
- Keep bridge notes short, factual, and tied to repo files.
- Put durable conclusions in `.agent-bridge/context/decisions.md`.
- Continue to follow normal source control hygiene for code changes.

## Before Stopping

Run:

```bash
agent-bridge validate
```

Resolve protocol errors and active conflicts before stopping when possible. Create a handoff with changed files, remaining work, risks, and verification if another agent or future session should continue.
