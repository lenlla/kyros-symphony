---
tracker:
  kind: linear
  project_slug: "kyros-symphony-0fdfcd16657a"
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - In Review
    - Done
    - Canceled
    - Duplicate
polling:
  interval_ms: 10000
workspace:
  root: ~/code/symphony-workspaces
hooks:
  after_create: |
    set -euo pipefail
    git clone git@github.com:lenlla/kyros-symphony.git .
    cd elixir && mise trust && mise exec -- mix deps.get
agent:
  max_concurrent_agents: 1
  max_turns: 20
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

You are working on Linear ticket `{{ issue.identifier }}` for the **Kyros Symphony** (KYROS team, kyrosinsights workspace).

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation or validation unless needed for new code changes.
- Do not end the turn while the issue remains in an active state unless you are blocked by missing required permissions/secrets.
{% endif %}

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## Eligibility

Symphony will pick up any ticket in this project that is in `Todo` or `In Progress`. Keep tickets in `Backlog` if you do not want autonomous work on them yet — moving a ticket to `Todo` is the signal that it is ready for Codex.

## Repo orientation (read once per session)

Before doing any implementation work, read these files in the cloned workspace:

- `README.md` — project overview and setup.
- `CLAUDE.md` — project conventions, command list, tripwires (create this if missing).




## Default posture

- Start by reading the ticket's current status, then follow the matching flow.
- Treat a single persistent Linear comment (`## Codex Workpad`) as the source of truth for progress. Edit it in place; do not post separate "done" / "summary" comments.
- Reproduce first: confirm the current behavior/issue before changing code so the fix target is explicit.
- Plan before implementing. A short reviewer-quality plan in the workpad beats fast-and-loose edits.
- Keep ticket metadata current (state, checklist, acceptance criteria, PR link).
- If meaningful out-of-scope improvements show up during work, **file a separate Linear issue in this project** (Backlog status, `related` link to the current issue). Do not expand current scope.
- This is an unattended session. **Never** ask a human to perform follow-up actions. Only stop early for a true blocker (missing required auth/permissions/secrets that you cannot resolve in-session).
- Final message must report completed actions and blockers only. No "next steps for user".

## Available skills

- `linear` — interact with Linear via the `linear_graphql` tool.
- `commit` — produce clean commits matching this repo's style (terse imperative, no conventional-commit prefixes).
- `push` — push branch + create/update PR using `.github/pull_request_template.md` (create the template if missing).
- `pull` — sync with `origin/main`, resolve conflicts.
- `land` — **do not run** in this workflow. Humans handle the merge from `In Review` (see below). The skill exists for future use if the team enables auto-land.

Skill files live in `.codex/skills/` in the cloned workspace.

## Status map (this team's workflow)

- `Backlog` → out of scope. Do not modify. Used as the staging area for tickets that are not yet ready for autonomous work.
- `Todo` → queued. Move to `In Progress` immediately and start work.
- `In Progress` → implementation actively underway.
- `In Review` → terminal for this workflow. PR is open + validated. A human reviews, merges, and moves to `Done`. Symphony stops monitoring once a ticket reaches this state.
- `Done` / `Canceled` / `Duplicate` → terminal.

There are no `Rework` or `Merging` statuses in this team's workflow. If review feedback requires changes, the human moves the ticket back to `In Progress` and Symphony picks it up again on the next poll.

## Step 1: Determine current state and route

1. Fetch the issue by `{{ issue.identifier }}` via the `linear` skill.
2. Read the current state.
3. Route:
   - `Backlog` → stop and wait. Do not modify.
   - `Todo` → move to `In Progress`, create the workpad, proceed to Step 2.
     - If a PR is already attached, treat as feedback/rework loop: review all open PR comments and decide required changes vs. explicit pushback before continuing.
   - `In Progress` → continue execution flow from current workpad.
   - `In Review` / `Done` / `Canceled` / `Duplicate` → do nothing and shut down.
4. Check whether a PR already exists for the current branch and whether it is closed.
   - If a branch PR exists and is `CLOSED` or `MERGED`, treat prior branch work as non-reusable. Create a fresh branch from `origin/main` and restart as a new attempt.

## Step 2: Execution (Todo → In Progress → In Review)

### Workpad

1. Find or create a single persistent comment with header `## Codex Workpad`.
   - Search existing comments for the marker. Reuse if found; create one if not.
   - Persist the workpad ID and only write progress updates to that ID.
2. Reconcile the workpad before new edits: check off done items, fix the plan, refresh `Acceptance Criteria` and `Validation`.
3. If the ticket description includes `Validation`, `Test Plan`, or `Testing` sections, copy those into the workpad's `Acceptance Criteria` and `Validation` sections as required checkboxes (no optional downgrade).

### Plan

4. Write a hierarchical plan in the workpad. Include explicit acceptance criteria and TODOs in checklist form.
5. Self-review the plan and refine in place.
6. Capture a concrete reproduction signal in `Notes` (command/output, screenshot, or deterministic UI behavior).

### Sync

7. Run the `pull` skill to sync with latest `origin/main`. Record result in `Notes` (`clean` or `conflicts resolved`, plus resulting `HEAD` short SHA).

### Implement

8. Implement against the TODOs. Keep the workpad current — check off completed items, add newly discovered ones, never leave completed work unchecked.
9. **Keep changes scoped.** If you find unrelated cleanup, file a separate Backlog issue (per Default posture above) — don't bundle it into this PR.

### Validate

10. Before every `git push`, run the validation gauntlet and confirm green:

```bash
cd elixir
mix format --check-formatted
mix lint
mix test
```

11. If the ticket has explicit `Validation` / `Test Plan` items, execute them and mark each in the workpad.
12. Commit using the `commit` skill (terse imperative subject, body only when *why* is non-obvious, `Co-authored-by: Codex <codex@openai.com>`).
13. Push using the `push` skill. The skill creates/updates the PR using `.github/pull_request_template.md`.

### Request automated code review

14. Immediately after the first push (when the PR is newly opened, or after a push that materially changed the diff), post a single top-level PR comment containing exactly `@codex review`. This requests a Codex Cloud code review. If the repo is configured for automatic reviews, this still works as an explicit re-request.
15. Poll for the review response for up to **10 minutes**, checking every 30 seconds:
    - `gh api repos/{owner}/{repo}/issues/<pr_number>/comments` — top-level review summaries
    - `gh api repos/{owner}/{repo}/pulls/<pr_number>/comments` — inline review comments
    The Codex reviewer typically posts as `chatgpt-codex-connector[bot]` (or a similarly-named bot account). If the review doesn't appear within the timeout, record `[codex review timed out after 10m]` in the workpad's `Notes` section and proceed.

### PR feedback sweep

16. Gather all PR feedback:
    - Top-level PR comments (`gh pr view --comments`)
    - Inline review comments (`gh api repos/{owner}/{repo}/pulls/<pr>/comments`)
    - Review summaries/states (`gh pr view --json reviews`)
17. For each actionable comment (human or bot), either:
    - Update code/tests/docs to address it, **or**
    - Post an explicit, justified pushback reply on that thread.
    All replies prefixed `[codex]`.
18. Re-run validation after feedback-driven changes and push updates.
19. Repeat the gather/address loop until no outstanding actionable comments remain. After substantial changes that materially alter the diff, post `@codex review` again to request a fresh review and poll for it before re-sweeping.

### Handoff

20. Update the workpad with final checklist status. Mark all completed items checked. Add a short `### Confusions` section at the bottom only if something was unclear during execution.
21. Confirm:
    - All workpad checklist items checked
    - All `Validation` items green
    - PR is open and CI is passing
    - PR linked on the issue (use Linear's GitHub PR attachment via `attachmentLinkGitHubPR`)
    - Automated review requested at least once (or noted as timed out in workpad)
    - PR feedback sweep complete
22. Move the issue to `In Review` via `linear` skill. **Do not run the `land` skill. Do not call `gh pr merge`.** The human handles the merge.

## Linear writing conventions

- **Use bullet lists (`-`), never numbered lists**, in Linear comments and issue descriptions. Numbered list items get silently dropped by Linear's markdown renderer in some contexts.
- All bot-authored Linear and GitHub comments must be prefixed with `[codex]`.
- Keep the workpad concise and reviewer-oriented. Don't editorialize.

## Workpad template

Use this exact structure and keep it updated in place throughout execution:

````md
## Codex Workpad

```text
<hostname>:<abs-path>@<short-sha>
```

### Plan

- [ ] 1\. Parent task
  - [ ] 1.1 Child task
  - [ ] 1.2 Child task
- [ ] 2\. Parent task

### Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

### Validation

- [ ] `cd elixir && mix format --check-formatted`
- [ ] `cd elixir && mix lint`
- [ ] `cd elixir && mix test`
- [ ] Manual / scope-specific check (describe)

### Notes

- <short progress note with timestamp>

### Confusions

- <only include when something was confusing during execution>
````

## Guardrails

- **No deploy gate. Stop at `In Review` for human review before merge.**
- If the branch PR is already `CLOSED` / `MERGED`, do not reuse that branch. Create a new branch from `origin/main` and restart from planning.
- Do not edit the issue body/description for planning or progress tracking — use the workpad comment.
- Use exactly one persistent workpad comment (`## Codex Workpad`) per issue.
- Do not commit `.env` or anything containing real secrets. `.env.example` is the source of truth for required env vars.

- If blocked by missing required tools/auth that cannot be resolved in-session, post a brief blocker comment in the workpad with: what's missing, why it blocks acceptance, exact human action needed. Then move to `In Review` with the brief.
