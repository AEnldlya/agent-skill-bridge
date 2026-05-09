# Agent Bridge Instructions For Codex

Use `.agent-bridge/` files to coordinate with Claude and humans when work spans agents, sessions, or uncertainty.

## Read Before Acting

Before starting shared work, inspect:

- `.agent-bridge/context/project.md` for product and repo context.
- `.agent-bridge/context/constraints.md` for boundaries and files to avoid.
- `.agent-bridge/context/decisions.md` for durable decisions.
- `.agent-bridge/tasks/open/`, `.agent-bridge/tasks/claimed/`, and `.agent-bridge/tasks/blocked/` for task state.
- `.agent-bridge/inbox/codex/` for questions, answers, reviews, handoffs, and status messages addressed to Codex.

## When To Write Bridge Artifacts

Create or update bridge artifacts when:

- You need Claude's help with design, reasoning, debugging, review, or a second opinion.
- You are handing work to Claude.
- You accept a handoff from Claude.
- You discover a durable decision that future agents should know.
- You are blocked and the blocker should be visible to humans.

## Codex Message Template

Prefer the CLI so messages land in the right inbox and logs:

```bash
agent-bridge message send claude \
  --from codex \
  --task TASK-ID \
  --intent question \
  --files src/file.ts,test/file.test.ts \
  --body "Question: ... Context: ... What I tried: ... Needed from you: ..."
```

## Codex Handoff Template

Use handoffs when Claude should continue, review, or take ownership:

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

## Coordination Rules

- Do not erase Claude's inbox artifacts or task records.
- Do not assume hidden chat context will survive. Put important state in bridge files.
- When accepting a Claude handoff, claim the task or send a `status` message to Claude.
- Keep bridge notes short, factual, and tied to repo files.
- Put durable conclusions in `.agent-bridge/context/decisions.md`.
- Continue to follow normal source control hygiene for code changes.
