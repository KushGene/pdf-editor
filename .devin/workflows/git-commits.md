---
description: How to write commits, create branches and open pull requests for the PDF Editor project
---

# Git Commits & Pull Requests

## Before You Commit

1. **Check your branch.** You must be on a topic branch, never on `main` or `develop`.
   ```bash
   git branch --show-current
   ```
2. **Stage only relevant changes.** Do not mix unrelated fixes in one commit.
   ```bash
   git add -p
   ```

## Commit Message Format

Follow **Conventional Commits** exactly:

```
<type>(<scope>): <short description>

[optional longer body]
```

### Types

| Type | Use when |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | README, comments, or documentation only |
| `style` | Formatting, semicolons, whitespace (no logic change) |
| `refactor` | Code restructuring without changing behavior |
| `test` | Adding or updating tests |
| `chore` | Build, deps, tooling, CI/CD changes |

### Scope

Pick the component you touched:
- `fields` — form field logic
- `buildPdfBytes` — PDF save/reconstruction
- `canvas` — rendering / overlay
- `ui` — React components, CSS
- `deps` — dependency updates
- `ci` — GitHub Actions, workflows

### Examples

```
feat(fields): add keyboard shortcut for deleting selected field

Users can now press Delete or Backspace to remove the currently
selected field from the canvas.
```

```
fix(buildPdfBytes): prevent checkbox widget overwrite on duplicate names

When two checkboxes share the same field name, pdf-lib's save
operation was dropping one widget. We now track seen widget
indices per field name to avoid collisions.
```

```
chore(deps): bump pdf-lib to 1.17.1
```

## Pre-Commit Checklist

- [ ] `npm run tauri dev` starts without errors
- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] Commit message follows conventional format
- [ ] Only relevant files are staged

## Opening a Pull Request

1. Push your topic branch to GitHub
2. Open PR against **`develop`** (never `main`)
3. PR title should match your commit message style: `feat(scope): description`
4. Fill the description: what changed and why
5. Link related issues if any (`Closes #123`)
6. Request review when ready
7. **Do not merge yourself** — wait for review approval

## Quick Reference

```bash
# Start work
git checkout develop
git pull origin develop
git checkout -b feat/what-you-are-doing

# Make changes, then commit
git add <files>
git commit -m "feat(scope): description"

# Push and open PR
git push -u origin feat/what-you-are-doing
gh pr create --base develop --title "feat(scope): description"

# Sync with latest develop before PR
git fetch origin
git rebase origin/develop
```
