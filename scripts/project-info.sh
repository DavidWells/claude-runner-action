#!/usr/bin/env bash
# Detects the checked-out project's type/framework and counts source files,
# writing project-type, framework and total-files to GITHUB_OUTPUT.
set -euo pipefail

echo "📁 Collecting project information"

project_type="unknown"
framework=""

if [ -f "package.json" ]; then
  project_type="node"
  echo "📦 Node.js project detected"
  if grep -q "next" package.json; then
    framework="Next.js"
  elif grep -q "react" package.json; then
    framework="React"
  elif grep -q "vue" package.json; then
    framework="Vue.js"
  elif grep -q "angular" package.json; then
    framework="Angular"
  elif grep -q "express" package.json; then
    framework="Express"
  fi
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
  project_type="python"
  framework="Python"
  echo "🐍 Python project detected"
elif [ -f "Cargo.toml" ]; then
  project_type="rust"
  framework="Rust"
  echo "🦀 Rust project detected"
elif [ -f "go.mod" ]; then
  project_type="go"
  framework="Go"
  echo "🐹 Go project detected"
elif [ -f "pom.xml" ] || [ -f "build.gradle" ]; then
  project_type="java"
  framework="Java"
  echo "☕ Java project detected"
fi

total_files=$(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.rs" -o -name "*.go" -o -name "*.java" \) | wc -l | tr -d ' ')

{
  echo "project-type=$project_type"
  echo "framework=$framework"
  echo "total-files=$total_files"
} >> "$GITHUB_OUTPUT"
echo "📊 Project summary: $framework ($total_files files)"
