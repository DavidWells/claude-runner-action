# claude-runner-action

Runs [Claude Code](https://github.com/anthropics/claude-code-action) from `@claude` mentions on Issues and PRs, or from `workflow_dispatch`, then opens PRs for its changes and reports back on the thread.

Two actions, used as two steps:

| Action | Step | Does |
| --- | --- | --- |
| `DavidWells/claude-runner-action@v1` | `timeout-minutes: 50` | Checks the trigger, sets up the repo, runs Claude, opens PRs |
| `DavidWells/claude-runner-action/finalize@v1` | `if: always()` | Saves the session, pushes unfinished work, uploads the transcript, updates the status comment |

The split exists because composite actions can't set `timeout-minutes` on their own steps. The caller times out the main step and finalize still runs, so a timed-out run keeps its work and session for the next `@claude`.

## Usage

Copy [`workflow-templates/claude.yml`](workflow-templates/claude.yml) to `.github/workflows/claude.yml`. The core of it:

```yaml
jobs:
  claude:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write
      pull-requests: write
      issues: write
      actions: write
      id-token: write
    steps:
      - uses: DavidWells/claude-runner-action@v1
        timeout-minutes: 50
        with:
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

      - if: always()
        uses: DavidWells/claude-runner-action/finalize@v1
```

Keep the job `timeout-minutes` above the Claude step's so finalize has time to run.

## Inputs

### Main action

| Input | Default | Description |
| --- | --- | --- |
| `claude-code-oauth-token` | required | Claude Code OAuth token |
| `github-token` | `github.token` | Checkout, status comments, repository API calls |
| `claude-github-token` | `''` | Token Claude and dispatch PRs act with (e.g. a PAT). Empty uses `github-token` |
| `allowed-users` | `''` | Comma-separated users allowed to dispatch runs. Empty: anyone who can dispatch |
| `allowed-bots` | `''` | Bot actors claude-code-action accepts |
| `event-bus-url` | `''` | Event bus for `claude.job.*` events. Empty disables |
| `event-bus-api-key` | `''` | Event bus API key |

### finalize

`github-token`, `event-bus-url`, `event-bus-api-key` — same meaning as above.

## Triggers

A run starts when:

- **workflow_dispatch** with `trigger_text` and `actor`. With `create_branch`, changes go to `claude/dispatch-<run_id>` and open a PR. `notify_email`/`in_reply_to`/`notify_subject` publish a result receipt to the event bus.
- **issues / issue_comment / PR review (comment)** mention `@claude` and the sender is the repo owner or an `OWNER`/`MEMBER`/`COLLABORATOR`.
- **pull_request_target** body mentions `@claude` and the PR is same-repo or from a trusted author.

Bodies stamped `claude-dispatch-artifact` never trigger, so PRs Claude opens don't re-trigger it. Issues that already have a linked PR are skipped.

Mention `fable`, `opus`, `haiku` or `sonnet` in the trigger text to pick a model (default `opus`).

## How state flows

The main action exports `CLAUDE_RUNNER_*` env vars as it goes; finalize reads them. Claude's outcome is recorded right after the Claude step, so a timeout later in the main step still reports the right outcome. A run that started Claude but never recorded an outcome is treated as failed.

## Development

```bash
npm test
```

```bash
npm run lint
```
