# EMEFast CI/CD Workflows

This directory contains production GitHub Actions workflows for continuous integration and automated testing.

## Included Workflows

1. **`frontend-ci.yml`**:
   - Triggers on PRs and pushes touching `frontend-v2/` or root configuration.
   - Installs dependencies using Node.js 20.
   - Executes TypeScript typechecking (`npm run typecheck`).
   - Builds the production Next.js 15 App Router bundle (`npm run build`).

2. **`backend-ci.yml`**:
   - Triggers on PRs and pushes touching `backend/` or `test_emefast_e2e.py`.
   - Sets up Python 3.12.
   - Compiles and syntax-checks all Python files (`py_compile`).
   - Runs the backend preflight router & database verification suite (`backend/verify.py`).
   - Runs the full EMEFast End-to-End integration suite (`test_emefast_e2e.py`).

## Workflow Templates (Reference) vs. Active Workflows

> [!NOTE]
> **Active CI Directory**: GitHub Actions exclusively executes workflows located under `.github/workflows/`.
> The files in this `ci/workflows/` directory are maintained as **reference templates / mirror backups** for environments where local Git credentials lack the OAuth `workflow` scope.

1. **Active Workflows**:
   - `.github/workflows/backend-ci.yml`
   - `.github/workflows/frontend-ci.yml`

2. **Reference Templates (Mirror)**:
   - `ci/workflows/backend-ci.yml`
   - `ci/workflows/frontend-ci.yml`

If configuring GitHub Actions from a fresh clone without push rights to `.github/workflows/`, copy these reference templates into `.github/workflows/` via the GitHub Web UI or GitHub CLI (`gh`).

