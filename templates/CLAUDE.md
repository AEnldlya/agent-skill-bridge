# Agent Bridge Instructions For Claude

Use `.agent-bridge/` as the coordination source of truth when collaborating with Codex, another agent, or a human across tasks, sessions, or uncertainty.

## Read Before Acting

Before starting shared work, inspect:

- `.agent-bridge/context/project.md` for product and repo context.
- `.agent-bridge/context/constraints.md` for boundaries, ownership notes, and files to avoid.
- `.agent-bridge/context/decisions.md` for durable human-approved decisions.
- `.agent-bridge/tasks/open/`, `.agent-bridge/tasks/claimed/`, and `.agent-bridge/tasks/blocked/` for task state.
- `.agent-bridge/inbox/claude/` for questions, answers, reviews, handoffs, and status messages addressed to Claude.

## Claim Work

Claim a task before editing files:

```bash
agent-bridge task claim TASK-ID --agent claude --files src/file.ts,test/file.test.ts
```

If the claim reports a file conflict, pause and coordinate with Codex or the human. Use `--force` only after the overlap is intentional and approved by a handoff, inbox agreement, or human instruction.

## Ask Codex For Help

Use Codex for implementation help, repo edits, test runs, debugging, verification, or a second opinion:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent question \
  --files src/file.ts,test/file.test.ts \
  --body "Question: ... Context: ... What I tried: ... Needed from you: ..."
```

For review:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent review \
  --files src/file.ts,test/file.test.ts \
  --body "Findings: ... Questions: ... Test gaps: ... Summary: ..."
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
- When accepting a Codex handoff, claim the task or send a `status` message to Codex.
- Keep bridge notes short, factual, and tied to repo files.
- Put durable conclusions in `.agent-bridge/context/decisions.md`.
- Continue to follow normal source control hygiene for code changes.

## Before Stopping

Run:

```bash
agent-bridge validate
```

Resolve protocol errors and active conflicts before stopping when possible. Create a handoff with changed files, remaining work, risks, and verification if another agent or future session should continue.
