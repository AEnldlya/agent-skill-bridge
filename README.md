# agent-skill-bridge

A file-based collaboration framework for Codex, Claude, and humans working in the same repository.

The idea is simple: agents coordinate through ordinary repo files instead of hidden state. They claim tasks, send messages, ask each other for help, and leave handoffs in `.agent-bridge/`.

## Why this exists

Codex and Claude are useful in different ways. The problem is coordination. If both agents edit the same project without a shared protocol, the human becomes the message bus. That gets old fast.

`agent-skill-bridge` gives them a shared workspace:

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
  logs/
    messages.jsonl
    tasks.jsonl
    handoffs.jsonl
```

Everything is inspectable. Humans can read it. Git can diff it. CI can validate it later.

## Install

```bash
npm install
npm run build
```

During development:

```bash
node dist/cli.js init
```

After publishing or linking:

```bash
agent-bridge init
```

## Commands

```bash
agent-bridge init
agent-bridge task create "Build auth flow" --files src/auth.ts --acceptance "login works,tests pass"
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts
agent-bridge message send claude --from codex --task TASK-ID --intent question --body "Can you review the session edge cases?"
agent-bridge handoff TASK-ID --from codex --to claude --summary "API route is ready" --files src/auth.ts --remaining "wire UI"
agent-bridge status
```

## Documentation

- [docs/protocol.md](docs/protocol.md) defines the `.agent-bridge/` file layout and record shapes.
- [examples/demo-workflow.md](examples/demo-workflow.md) walks through a Codex and Claude collaboration loop.
- [templates/AGENTS.md](templates/AGENTS.md) provides a Codex-ready instruction section.
- [templates/CLAUDE.md](templates/CLAUDE.md) provides a Claude-ready instruction section.

## Collaboration Rule

Agents should treat `.agent-bridge` as the coordination source of truth:

1. Read `.agent-bridge/context/*.md`.
2. Claim a task before editing files.
3. Message the other agent when blocked.
4. Handoff with changed files, remaining work, risks, and verification.
5. Do not revert another agent's work without human approval.
6. Put durable decisions in `.agent-bridge/context/decisions.md`.

## Status

This is an MVP. It gives the protocol and CLI foundation. Next useful steps are conflict detection, schema validation, and MCP wrappers.
