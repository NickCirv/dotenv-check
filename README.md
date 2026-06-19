<div align="center">

# dotenv-check

**Catch missing or malformed `.env` variables before they crash your app**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?labelColor=0B0A09)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-339933?labelColor=0B0A09&logo=node.js&logoColor=white)](package.json)

</div>

## Install

```bash
npx github:NickCirv/dotenv-check
```

## Usage

```bash
# Validate .env against .env.example (default)
envcheck

# Validate a specific env file
envcheck --env .env.production --example .env.example

# Check explicit required vars
envcheck --required "DATABASE_URL,REDIS_URL,SECRET_KEY"

# Full audit: format + duplicates + unused
envcheck --check-format --check-duplicates --unused

# CI mode — exit 1 on any warning
envcheck --strict

# JSON output for scripting
envcheck --format json
```

| Flag | Description |
|------|-------------|
| `--env <path>` | `.env` file to validate (default: `.env`) |
| `--example <path>` | Reference file (default: `.env.example`) |
| `--required <VARS>` | Comma-separated list of required var names |
| `--check-format` | Validate key naming, URL/port/boolean formats |
| `--check-duplicates` | Flag duplicate keys in `.env` |
| `--unused` | Show vars in `.env` not documented in `.env.example` |
| `--strict` | Exit 1 on warnings, not just errors |
| `--format json\|table` | Output format (default: `table`) |

## What it does

Reads your `.env` and `.env.example` files and reports which required variables are set, missing, or malformed — without ever printing their values. Exit codes are CI-friendly: `0` = all clear, `1` = missing required vars, `2` = parse error. Use `--strict` to block deploys on any warning.

Values are **never** logged or output — only variable names and their status.

---
<sub>Zero dependencies · Node ≥18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
