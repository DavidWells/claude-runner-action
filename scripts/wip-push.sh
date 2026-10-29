#!/usr/bin/env bash
# Commits whatever a failed/timed-out Claude run left behind and pushes it so a
# follow-up run (which resumes the session) starts from it. Never pushes to the default branch.
set -euo pipefail

if [ -z "$(git status --porcelain)" ] && [ "$(git rev-parse HEAD)" = "$START_SHA" ]; then
  echo "✅ No unfinished work to push"
  exit 0
fi

BRANCH=$(git symbolic-ref --short -q HEAD || echo "$HEAD_REF")
if [ -z "$BRANCH" ] || [ "$BRANCH" = "$DEFAULT_BRANCH" ]; then
  BRANCH="claude/wip-${RUN_ID}"
fi

if [ -n "$(git status --porcelain)" ]; then
  git config user.name "claude[bot]"
  git config user.email "claude[bot]@users.noreply.github.com"
  git add -A
  git commit -m "wip: unfinished Claude work from run ${RUN_ID} (${CLAUDE_OUTCOME})"
fi

git push origin "HEAD:refs/heads/$BRANCH"
echo "📦 Pushed unfinished work to $BRANCH"
echo "branch=$BRANCH" >> "$GITHUB_OUTPUT"
echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
