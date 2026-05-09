# Agent Bridge Instructions For Claude

Use `.agent-bridge/` files to coordinate with Codex and humans when work spans agents, sessions, or uncertainty.

## Read Before Acting

Before starting shared work, inspect:

- `.agent-bridge/context/project.md` for product and repo context.
- `.agent-bridge/context/constraints.md` for boundaries and files to avoid.
- `.agent-bridge/context/decisions.md` for durable decisions.
- `.agent-bridge/tasks/open/`, `.agent-bridge/tasks/claimed/`, and `.agent-bridge/tasks/blocked/` for task state.
- `.agent-bridge/inbox/claude/` for questions, answers, reviews, handoffs, and status messages addressed to Claude.

## When To Write Bridge Artifacts

Create or update bridge artifacts when:

- Codex asks for help or review.
- You need Codex to implement, verify, or continue work.
- You accept a handoff from Codex.
- You identify a durable architectural or product decision.
- You are blocked and the blocker should be visible to humans.

## Claude Answer Template

Prefer the CLI so answers land in the right inbox and logs:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent answer \
  --files src/file.ts,test/file.test.ts \
  --body "Short answer: ... Reasoning: ... Suggested next steps: ... Confidence: ..."
```

## Claude Handoff Template

Use handoffs when Codex should implement, verify, or continue:

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

## Review Template

Write reviews as inbox messages:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent review \
  --files src/file.ts,test/file.test.ts \
  --body "Findings: ... Questions: ... Test gaps: ... Summary: ..."
```

## Coordination Rules

- Do not erase Codex inbox artifacts or task records.
- Treat bridge files as the shared memory that future sessions can trust.
- Keep answers actionable: name files, commands, risks, and next steps.
- When taking ownership, claim the task or send a `status` message to Codex.
- Durable conclusions belong in `.agent-bridge/context/decisions.md`.
