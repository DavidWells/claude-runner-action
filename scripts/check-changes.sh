#!/usr/bin/env bash
# Checks out the branch Claude pushed for an Issue and reports whether it differs
# from the default branch (has-changes / branch-exists in GITHUB_OUTPUT).
set -euo pipefail

DEFAULT_REF="origin/${DEFAULT_BRANCH}"

echo "--- 1. Checking if remote branch '${BRANCH_NAME}' exists ---"
if ! git ls-remote --exit-code --heads origin "${BRANCH_NAME}" >/dev/null 2>&1; then
  echo "✅ Remote branch '${BRANCH_NAME}' not found. This indicates no code changes were committed."
  echo "has-changes=false" >> "$GITHUB_OUTPUT"
  echo "branch-exists=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
echo "branch-exists=true" >> "$GITHUB_OUTPUT"

echo "--- 2. Initial git state ---"
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Current commit: $(git log -1 --pretty=%h)"
git status -s

echo "🚀 3. Fetching '${BRANCH_NAME}'..."
git fetch origin "+refs/heads/${BRANCH_NAME}:refs/remotes/origin/${BRANCH_NAME}"
echo "Remote commit for '${BRANCH_NAME}' is: $(git log "origin/${BRANCH_NAME}" -1 --pretty=%h)"

echo "🔄 4. Resetting local branch to the fetched remote state..."
git checkout "${BRANCH_NAME}"
git reset --hard "origin/${BRANCH_NAME}"
echo "Current branch is now: $(git rev-parse --abbrev-ref HEAD) @ $(git log -1 --pretty=%h)"

BRANCH_RANGE="${DEFAULT_REF}...${BRANCH_NAME}"
echo "🔍 5. Checking for changes in range: ${BRANCH_RANGE}..."
if git diff --quiet "$BRANCH_RANGE"; then
  echo "✅ No changes detected between branches."
  echo "has-changes=false" >> "$GITHUB_OUTPUT"
else
  echo "📝 Changes detected."
  echo "has-changes=true" >> "$GITHUB_OUTPUT"
  echo "📄 Changed files (compared to default branch):"
  git diff --name-only "$BRANCH_RANGE"
  echo "📊 Change statistics:"
  git diff --stat "$BRANCH_RANGE"
fi
