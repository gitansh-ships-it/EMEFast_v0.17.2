# Contributing to EMEFast

Thank you for your interest in contributing to **EMEFast**! We welcome contributions that improve reliability, emergency coordination workflows, test coverage, and documentation.

---

## 1. Development Workflow

### 1.1 Local Setup
Clone the repository and run the automated setup script:

```bash
# On Windows (PowerShell):
.\scripts\setup.ps1

# On Linux / macOS (Bash):
./scripts/setup.sh
```

To run both the FastAPI backend and Next.js frontend concurrently:
```bash
# On Windows (PowerShell):
.\scripts\dev.ps1

# On Linux / macOS (Bash):
./scripts/dev.sh
```

---

## 2. Branch Naming Conventions

Always create a dedicated feature branch from `main`:

| Prefix | Usage | Example |
| :--- | :--- | :--- |
| `feature/` | New functionality or workflow | `feature/hospital-routing-elevation` |
| `fix/` | Bug fixes or stability patches | `fix/resource-lock-timeout` |
| `docs/` | Documentation improvements | `docs/api-voice-endpoints` |
| `refactor/`| Code refactoring without behavioral change | `refactor/hospital-matcher` |
| `ci/` | GitHub Actions or DevOps changes | `ci/add-backend-cache` |

---

## 3. Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(scope): add hospital diversion status filter`
- `fix(backend): correct ETA calculation when origin is null`
- `docs(api): document audio blob upload payload constraints`
- `test(e2e): add concurrency collision test for ER trauma beds`
- `chore(deps): bump next from 15.5.7 to 15.5.25`

---

## 4. Testing & Verification Checklist

Before opening a pull request, ensure all test suites pass locally:

1. **Backend Verification**:
   ```bash
   python backend/verify.py
   python test_emefast_e2e.py
   ```
2. **Frontend Typecheck & Build**:
   ```bash
   cd frontend-v2
   npm run typecheck
   npm run build
   ```
3. **Hygiene Verification**:
   - Zero hardcoded absolute local machine paths or personal identifiers.
   - Zero committed secrets or API tokens.

---

## 5. Submitting a Pull Request

1. Push your branch to GitHub.
2. Open a Pull Request against `main`.
3. Complete all sections of the [Pull Request Template](.github/pull_request_template.md).
4. Ensure all GitHub Actions CI checks (`Frontend CI`, `Backend CI`) pass green.
