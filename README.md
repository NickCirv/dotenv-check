# dotenv-check

> Validate .env files. Check required vars, detect issues. Never logs values.

Zero dependencies. Pure Node.js. Works in any project.

```
Variable             Status               Format Check
────────────────────────────────────────────────────────────
DATABASE_URL         ✓ SET                ✓
API_KEY              ✓ SET                —
REDIS_URL            ✗ MISSING            —
SECRET_KEY           ✗ MISSING            —
TYPO_VAR             ⚠ MISSING (optional) —

✗ 2 required variable(s) missing
  REDIS_URL [MISSING]
  SECRET_KEY [MISSING]
```

## Install

```bash
# Run directly with npx
npx dotenv-check

# Or install globally
npm install -g dotenv-check
```

## Quick Start

```bash
# Validate .env against .env.example in current directory
envcheck

# Validate a specific env file
envcheck --env .env.production --example .env.example

# Check specific required vars
envcheck --required "DATABASE_URL,REDIS_URL,SECRET_KEY"

# Full audit: format + duplicates + unused vars
envcheck --check-format --check-duplicates --unused

# CI mode: fail on any warning
envcheck --strict

# JSON output for scripting
envcheck --format json
```

## Checks

| Check | Flag | Description |
|-------|------|-------------|
| Required vars | (default) | Fails if vars in `.env.example` are missing from `.env` |
| Specific vars | `--required` | Comma-separated list of vars that must be present |
| Format rules | `--check-format` | Key naming, URL/port/boolean format validation |
| Duplicates | `--check-duplicates` | Flags duplicate keys in `.env` |
| Unused vars | `--unused` | Shows vars in `.env` not documented in `.env.example` |

## Options

```
--env <path>          .env file to validate (default: .env)
--example <path>      .env.example reference file (default: .env.example)
--required <VARS>     Comma-separated list of required var names
--check-format        Validate key/value formatting rules
--check-duplicates    Flag duplicate keys in .env file
--unused              Show vars in .env not in .env.example
--strict              Exit 1 on any warning (not just errors)
--format json|table   Output format (default: table)
--help, -h            Show help
--version, -v         Show version
```

## .env.example Format

`dotenv-check` understands a rich `.env.example` format:

```bash
# Required variables — must be set
DATABASE_URL=postgres://localhost/mydb
SECRET_KEY=your-secret-here

# Optional variables — present in example but not required
# REDIS_URL=redis://localhost:6379
# DEBUG=false
```

- `KEY=` or `KEY=placeholder` — **required** (missing = error)
- `# KEY=` — **optional** (missing = warning)
- `#` comments and blank lines — ignored

## Format Validation Rules

When `--check-format` is used:

| Rule | Example |
|------|---------|
| No spaces around `=` | `KEY=value` not `KEY = value` |
| Valid key format | `UPPER_CASE_ONLY` |
| `_URL` vars must be valid URLs | `DATABASE_URL=postgres://...` |
| `_PORT` vars must be numeric | `APP_PORT=3000` |
| Boolean vars must be `true/false/1/0` | `IS_PROD=true`, `USE_CACHE=1` |
| No unnecessary quotes | `KEY=simple` not `KEY="simple"` |

Boolean keys detected: `_ENABLED`, `_DISABLED`, `IS_*`, `USE_*`, `ENABLE_*`

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | Missing required variables (or warnings with `--strict`) |
| `2` | Parse error (file not found, invalid syntax) |

## JSON Output

Use `--format json` for scripting or CI integration:

```json
{
  "summary": {
    "total": 5,
    "set": 3,
    "missing": 2,
    "warnings": 0
  },
  "variables": [
    { "name": "DATABASE_URL", "status": "SET", "required": true, "extra": false, "formatIssues": [] },
    { "name": "API_KEY", "status": "MISSING", "required": true, "extra": false, "formatIssues": [] }
  ],
  "duplicates": [],
  "parseErrors": []
}
```

## CI Integration

```yaml
# GitHub Actions
- name: Check .env
  run: npx dotenv-check --strict
```

```bash
# Pre-commit hook
#!/bin/sh
npx dotenv-check --strict || exit 1
```

## Security

- Values are **NEVER** printed, logged, or output — only variable **names**
- Output always shows `[SET]` or `[MISSING]`, never the actual value
- Safe to use in CI logs, pair programming sessions, and shared terminals

---

Built with Node.js · Zero dependencies · MIT License
