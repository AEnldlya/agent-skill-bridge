# Demo Workflow

This walkthrough shows the intended Codex and Claude help loop: one agent owns implementation, the other provides focused review and continuation help, and the shared state lives in `.agent-bridge/`.

## 1. Initialize A Project

```bash
agent-bridge init --install-templates
```

This creates `.agent-bridge/` and appends installable instruction sections to `AGENTS.md` and `CLAUDE.md` when those sections are not already present.

Fill in the durable context files before asking agents to coordinate:

```text
.agent-bridge/context/project.md
.agent-bridge/context/constraints.md
.agent-bridge/context/decisions.md
```

## 2. Create A Task

```bash
agent-bridge task create "Add login form" \
  --created-by human \
  --files src/Login.tsx,src/auth.ts \
  --acceptance "form submits,errors render,tests pass"
```

The task starts in `.agent-bridge/tasks/open/`. The `files` list is used for coordination and conflict detection.

## 3. Codex Claims The Backend Slice

```bash
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts
```

Codex edits `src/auth.ts`, adds tests, and asks Claude for targeted help:

```bash
agent-bridge message send claude \
  --from codex \
  --task TASK-ID \
  --intent question \
  --files src/auth.ts,test/auth.test.ts \
  --body "Question: Can you review the session edge cases? Context: Auth helper and tests are ready. What I tried: password validation and expiry tests. Needed from you: call out missing cases before UI wiring."
```

## 4. Claude Replies

Claude reads `.agent-bridge/inbox/claude/`, reviews the named files, and replies:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent answer \
  --files src/auth.ts,test/auth.test.ts \
  --body "Short answer: Add an empty-password guard before submitLogin. Reasoning: the helper otherwise emits a network call for invalid input. Suggested next steps: add a unit test and then request final review. Confidence: high."
```

## 5. Codex Requests Review

After adding the empty-password guard, Codex asks Claude to review the backend slice:

```bash
agent-bridge message send claude \
  --from codex \
  --task TASK-ID \
  --intent review \
  --files src/auth.ts,test/auth.test.ts \
  --body "Findings requested: please review the auth helper and test coverage before UI wiring. Questions: are expiry and empty-password paths covered? Test gaps: call out anything missing. Summary: backend slice is ready for handoff if clean."
```

## 6. Claude Claims The UI File

Claude can claim the UI file without colliding with Codex because the file lists do not overlap:

```bash
agent-bridge task claim TASK-ID --agent claude --files src/Login.tsx
```

If Claude tries to claim `src/auth.ts` while Codex owns it, the bridge reports a conflict instead of silently allowing overlap.

## 7. Handle A Conflict Intentionally

Suppose Claude really does need `src/auth.ts` to finish the UI integration. First, Claude asks for coordination:

```bash
agent-bridge message send codex \
  --from claude \
  --task TASK-ID \
  --intent status \
  --files src/auth.ts,src/Login.tsx \
  --body "Current state: UI integration needs one auth helper signature tweak. Files I own: src/Login.tsx. Next step: please hand off src/auth.ts or confirm I can claim it. Blocking risk: overlapping edits."
```

Codex can hand off ownership:

```bash
agent-bridge handoff TASK-ID \
  --from codex \
  --to claude \
  --summary "Backend helper and tests are complete; Claude may make the UI-facing signature tweak." \
  --files src/auth.ts,test/auth.test.ts \
  --remaining "Wire Login.tsx and adjust helper signature only if needed" \
  --risks "Keep existing expiry behavior" \
  --verification "npm test"
```

Use `--force` only when the overlap is already approved:

```bash
agent-bridge task claim TASK-ID --agent claude --files src/auth.ts --force
```

`--force` bypasses the conflict guard for this claim. It does not merge code or give permission to revert Codex's edits.

## 8. Claude Records A Durable Decision

If the agents agree on a rule that future sessions need, Claude adds it to `.agent-bridge/context/decisions.md`:

```markdown
## 2026-05-09: Login form validation

The login form must reject empty passwords before calling `submitLogin`.
This keeps UI behavior aligned with the auth helper and avoids unnecessary network calls.
```

## 9. Validate Before Stopping

```bash
agent-bridge validate
```

Validation checks protocol shape, JSONL logs, task placement, missing acceptance criteria, claimed-task owners, and active file conflicts. Treat validation failures as coordination work to resolve before stopping.

## 10. Human Checks Status

```bash
agent-bridge status
```

The human can inspect `.agent-bridge/logs/messages.jsonl`, `.agent-bridge/logs/handoffs.jsonl`, and each agent inbox to see how the agents discussed the task.

When acceptance criteria are satisfied:

```bash
agent-bridge task done TASK-ID
agent-bridge validate
```
