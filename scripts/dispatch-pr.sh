#!/usr/bin/env bash
# Dispatch-branch runs: commits anything Claude left uncommitted, pushes the branch
# and opens a PR (Claude's summary + original instruction) when it differs from the default branch.
set -euo pipefail

if [ -n "$(git status --porcelain)" ]; then
  echo "📝 Committing uncommitted changes left by Claude"
  git config user.name "claude[bot]"
  git config user.email "claude[bot]@users.noreply.github.com"
  git add -A
  git commit -m "Claude changes from workflow dispatch"
fi

if git diff --quiet "origin/${DEFAULT_BRANCH}...HEAD"; then
  echo "✅ No changes vs ${DEFAULT_BRANCH}, skipping branch push and PR"
  exit 0
fi

git push origin "$BRANCH_NAME"

# Claude's final message from the execution log becomes the PR summary
CLAUDE_SUMMARY=""
if [ -n "${EXECUTION_FILE:-}" ] && [ -f "$EXECUTION_FILE" ]; then
  CLAUDE_SUMMARY=$(jq -r '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text] | last // empty' "$EXECUTION_FILE" 2>/dev/null | head -c 4000 || true)
fi

# "@claude" in a PR body would re-trigger the workflow — refer to the bot
# without the @ and stamp the artifact marker
BODY_FILE=$(mktemp)
{
  if [ -n "$CLAUDE_SUMMARY" ]; then
    printf '%s\n\n' "$CLAUDE_SUMMARY" | sed 's/@claude/Claude/g'
  fi
  echo "<details><summary>Original instruction</summary>"
  echo ""
  echo '```text'
  printf '%s\n' "$TRIGGER_TEXT" | sed -e 's/@claude/Claude/g' -e 's/```/~~~/g'
  echo '```'
  echo ""
  echo "</details>"
  echo ""
  echo "🤖 Created by Claude from a \`workflow_dispatch\` run: ${RUN_URL}"
  echo ""
  echo "<!-- claude-dispatch-artifact -->"
} > "$BODY_FILE"

PR_TITLE=$(git log -1 --pretty=%s)
PR_URL=$(gh pr create \
  --base "$DEFAULT_BRANCH" \
  --head "$BRANCH_NAME" \
  --title "$PR_TITLE" \
  --body-file "$BODY_FILE")
echo "🔀 Opened PR: $PR_URL"
echo "CLAUDE_RUNNER_DISPATCH_PR_URL=$PR_URL" >> "$GITHUB_ENV"
