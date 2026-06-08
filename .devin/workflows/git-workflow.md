---
description: Git branching, versioning and release workflow for the PDF Editor project
---

# Git Workflow & Versioning

This project uses **Git Flow** with two permanent branches and short-lived topic branches.

## Branch Model

| Branch | Purpose | Lifespan |
|---|---|---|
| `main` | Production-ready code. Always deployable. | Permanent |
| `develop` | Integration branch for upcoming release. | Permanent |
| `feature/<name>` | New features. Branch from `develop`. | Temporary |
| `fix/<name>` | Bug fixes. Branch from `develop`. | Temporary |
| `release/<v>` | Release preparation. Branch from `develop`. | Temporary |
| `hotfix/<name>` | Critical production fixes. Branch from `main`. | Temporary |

## Workflow Rules

1. **Never commit directly to `main` or `develop`.** Always use a topic branch.
2. **Feature branches:**
   - Create from latest `develop`.
   - Rebase onto `develop` before opening a PR.
   - Merge via squash or merge commit after review.
3. **Fix branches:**
   - Same rules as feature branches.
   - Prefix with `fix/`.
4. **Release branches:**
   - Branch from `develop` when features are frozen.
   - Only bug fixes and version bumps allowed.
   - Merge into `main` and `develop` when done.
5. **Hotfix branches:**
   - Branch from `main` for urgent fixes.
   - Merge into both `main` and `develop`.

## Versioning

This project uses **SemVer** (`MAJOR.MINOR.PATCH`):

- **MAJOR** — Breaking changes or major UI/UX redesign.
- **MINOR** — New features, non-breaking enhancements.
- **PATCH** — Bug fixes, dependency updates, minor refactors.

Version is stored in:
- `package.json` (frontend)
- `src-tauri/Cargo.toml` (backend)
- Git tags (`v1.2.3`)

## Commit Messages

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(fields): add radio group support`
- `fix(buildPdfBytes): prevent duplicate widget overwrite`
- `chore(deps): update pdf-lib to 1.17.1`

## Pull Request Checklist

- [ ] Branch is up to date with target branch (`git rebase`)
- [ ] `npm run tauri dev` starts without errors
- [ ] `npx tsc --noEmit` passes
- [ ] Commit messages follow conventional format
- [ ] PR description explains what and why

## Commands

```bash
# Start a feature
git checkout develop
git pull origin develop
git checkout -b feat/new-field-type

# Start a fix
git checkout develop
git pull origin develop
git checkout -b fix/duplicate-widget-bug

# Start a hotfix
git checkout main
git pull origin main
git checkout -b hotfix/critical-save-bug

# Sync before PR
git fetch origin
git rebase origin/develop

# Create a release branch
git checkout develop
git checkout -b release/v0.2.0

# Tag a release
git checkout main
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```
