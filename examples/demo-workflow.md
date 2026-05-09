# Demo Workflow

This is the intended first useful loop.

## 1. Initialize

```bash
agent-bridge init
```

## 2. Create a task

```bash
agent-bridge task create "Add login form" --files src/Login.tsx,src/auth.ts --acceptance "form submits,errors render,tests pass"
```

## 3. Codex claims the backend slice

```bash
agent-bridge task claim TASK-ID --agent codex --files src/auth.ts
```

Codex edits `src/auth.ts`, adds tests, then asks Claude for UI review:

```bash
agent-bridge message send claude --from codex --task TASK-ID --intent question --body "Auth helper is ready. Can you wire and review the login form?"
```

## 4. Claude replies

Claude reads `.agent-bridge/inbox/claude/`, reviews the files, and replies:

```bash
agent-bridge message send codex --from claude --task TASK-ID --intent answer --body "Looks good. I found one empty-password edge case. Add a guard before calling submitLogin."
```

## 5. Codex asks for review

After adding the empty-password guard, Codex asks Claude to review the final backend slice:

```bash
agent-bridge message send claude --from codex --task TASK-ID --intent review --files src/auth.ts,test/auth.test.ts --body "Findings requested: please review the auth helper and test coverage before UI wiring."
```

## 6. Codex hands off

```bash
agent-bridge handoff TASK-ID --from codex --to claude --summary "Auth helper and tests are done." --files src/auth.ts,test/auth.test.ts --remaining "Wire Login.tsx" --verification "npm test"
```

## 7. Claude records a durable decision

If the agents agree on a rule that future sessions need, Claude adds it to `.agent-bridge/context/decisions.md`:

```markdown
## 2026-05-09: Login form validation

The login form must reject empty passwords before calling `submitLogin`.
This keeps UI behavior aligned with the auth helper and avoids unnecessary network calls.
```

## 8. Human checks status

```bash
agent-bridge status
```

The human can inspect `.agent-bridge/logs/messages.jsonl`, `.agent-bridge/logs/handoffs.jsonl`, and each agent inbox to see how the agents discussed the task.
