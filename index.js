#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const VERSION = '1.0.0'
const EXIT = { OK: 0, MISSING: 1, PARSE_ERROR: 2 }

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

const c = (color, str) => process.stdout.isTTY ? `${COLORS[color]}${str}${COLORS.reset}` : str

// ─── ARGUMENT PARSING ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = {
    env: '.env',
    example: '.env.example',
    required: null,
    checkFormat: false,
    checkDuplicates: false,
    unused: false,
    strict: false,
    format: 'table',
    help: false,
    version: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--env':
        opts.env = args[++i]
        break
      case '--example':
        opts.example = args[++i]
        break
      case '--required':
        opts.required = args[++i]
        break
      case '--check-format':
        opts.checkFormat = true
        break
      case '--check-duplicates':
        opts.checkDuplicates = true
        break
      case '--unused':
        opts.unused = true
        break
      case '--strict':
        opts.strict = true
        break
      case '--format':
        opts.format = args[++i]
        if (!['json', 'table'].includes(opts.format)) {
          die(`Invalid format: ${opts.format}. Use json or table.`, EXIT.PARSE_ERROR)
        }
        break
      case '--help':
      case '-h':
        opts.help = true
        break
      case '--version':
      case '-v':
        opts.version = true
        break
      default:
        if (arg.startsWith('-')) {
          die(`Unknown option: ${arg}. Run with --help for usage.`, EXIT.PARSE_ERROR)
        }
    }
  }

  return opts
}

// ─── HELP ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c('bold', 'dotenv-check')} v${VERSION} — .env file validator

${c('bold', 'USAGE')}
  envcheck [options]
  dotenv-check [options]

${c('bold', 'OPTIONS')}
  --env <path>              .env file to validate (default: .env)
  --example <path>          .env.example reference file (default: .env.example)
  --required <VARS>         Comma-separated list of required var names
  --check-format            Validate key/value formatting rules
  --check-duplicates        Flag duplicate keys in .env file
  --unused                  Show vars in .env not in .env.example
  --strict                  Exit 1 on any warning (not just errors)
  --format json|table       Output format (default: table)
  --help, -h                Show this help
  --version, -v             Show version

${c('bold', 'EXIT CODES')}
  0   All checks passed
  1   Missing required variables (or warnings in --strict mode)
  2   Parse error

${c('bold', 'EXAMPLES')}
  envcheck
  envcheck --env .env.production --example .env.example
  envcheck --required "DATABASE_URL,REDIS_URL,SECRET_KEY"
  envcheck --check-format --check-duplicates --strict
  envcheck --unused --format json

${c('bold', 'FORMAT RULES')} (--check-format)
  - No spaces around = (KEY=value, not KEY = value)
  - Uppercase letters, numbers, underscores only in key names
  - Vars ending in _URL must look like valid URLs
  - Vars ending in _PORT must be numeric
  - Vars ending in _ENABLED, _DISABLED, IS_*, USE_*, ENABLE_* must be boolean

${c('dim', 'Values are NEVER printed. Only variable names are shown.')}
`.trim())
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

/**
 * Parse a .env file. Returns { entries, duplicates, parseErrors }.
 * NEVER stores or returns actual values — only key names and presence info.
 */
function parseEnvFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split('\n')
  const entries = new Map()   // key -> { line, hasValue }
  const duplicates = []
  const parseErrors = []
  const formatIssues = []

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]

    // Skip blank lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) continue

    // Detect spaces around = for format checking
    const spaceEqMatch = line.match(/^([A-Z0-9_]+)\s+=\s*(.*)$/)
    if (spaceEqMatch) {
      formatIssues.push({ key: spaceEqMatch[1], type: 'space_around_eq', lineNum })
    }

    // Standard parse: KEY=value
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) {
      parseErrors.push({ lineNum, line })
      continue
    }

    const key = line.slice(0, eqIdx).trim()
    const rawValue = line.slice(eqIdx + 1)

    // Validate key format
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) && !/^[A-Z0-9_]+$/.test(key)) {
      formatIssues.push({ key, type: 'invalid_key_format', lineNum })
    }

    // Track presence of a value (boolean only — never store actual value)
    const hasValue = rawValue.trim().length > 0

    // Check for unnecessary quotes (only warn, value not stored)
    const stripped = rawValue.trim()
    if ((stripped.startsWith('"') && stripped.endsWith('"')) ||
        (stripped.startsWith("'") && stripped.endsWith("'"))) {
      const inner = stripped.slice(1, -1)
      // Simple value = no spaces, special chars — quotes unnecessary
      if (/^[a-zA-Z0-9._/-]+$/.test(inner)) {
        formatIssues.push({ key, type: 'unnecessary_quotes', lineNum })
      }
    }

    if (entries.has(key)) {
      duplicates.push({ key, lineNum, firstLine: entries.get(key).lineNum })
    }

    entries.set(key, { lineNum, hasValue, rawValue })
  }

  return { entries, duplicates, formatIssues, parseErrors }
}

/**
 * Parse .env.example. Returns { required, optional }.
 * Keys with `KEY=` = required. Lines with `# KEY=` = optional.
 * NEVER stores actual values.
 */
function parseExampleFile(filePath) {
  if (!existsSync(filePath)) return null

  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split('\n')
  const required = new Set()
  const optional = new Set()

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    // Optional: commented-out key `# KEY=` or `# KEY=value`
    const optionalMatch = trimmed.match(/^#\s+([A-Z][A-Z0-9_]*)=/)
    if (optionalMatch) {
      optional.add(optionalMatch[1])
      continue
    }

    // Skip other comments
    if (trimmed.startsWith('#')) continue

    // Required: KEY= or KEY=placeholder
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        required.add(key)
      }
    }
  }

  return { required, optional }
}

// ─── FORMAT VALIDATION ────────────────────────────────────────────────────────

/**
 * Validate format rules for a single entry.
 * Reads rawValue only to determine TYPE/PATTERN — never prints it.
 */
function validateFormat(key, entry, formatIssues) {
  const issues = [...formatIssues.filter(f => f.key === key)]
  const rawValue = entry.rawValue.trim()

  // URL validation: key ends in _URL
  if (key.endsWith('_URL')) {
    try {
      new URL(rawValue)
    } catch {
      issues.push({ key, type: 'invalid_url', lineNum: entry.lineNum })
    }
  }

  // Port validation: key ends in _PORT
  if (key.endsWith('_PORT')) {
    if (!/^\d+$/.test(rawValue) || parseInt(rawValue, 10) > 65535) {
      issues.push({ key, type: 'invalid_port', lineNum: entry.lineNum })
    }
  }

  // Boolean validation
  const boolPatterns = ['_ENABLED', '_DISABLED', 'IS_', 'USE_', 'ENABLE_']
  const isBoolKey = boolPatterns.some(p =>
    key.endsWith(p) || key.startsWith(p) || key.includes(p)
  )
  if (isBoolKey) {
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(rawValue.toLowerCase())) {
      issues.push({ key, type: 'invalid_boolean', lineNum: entry.lineNum })
    }
  }

  return issues
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────

function buildResults(opts, envData, example) {
  const { entries, duplicates, formatIssues, parseErrors } = envData
  const rows = []
  const allKeys = new Set()

  // Keys from example (required + optional)
  if (example) {
    for (const k of example.required) allKeys.add(k)
    for (const k of example.optional) allKeys.add(k)
  }
  // Keys from --required
  if (opts.required) {
    for (const k of opts.required.split(',').map(s => s.trim()).filter(Boolean)) {
      allKeys.add(k)
    }
  }
  // Keys from .env itself (for --unused)
  for (const k of entries.keys()) allKeys.add(k)

  for (const key of allKeys) {
    const entry = entries.get(key)
    const inEnv = !!entry && entry.hasValue
    const inExample = example ? (example.required.has(key) || example.optional.has(key)) : null
    const isRequired = (example && example.required.has(key)) ||
      (opts.required && opts.required.split(',').map(s => s.trim()).includes(key))
    const isOptional = example && example.optional.has(key)
    const isExtra = inExample === false && entry !== undefined

    let status, statusCode
    if (inEnv) {
      status = 'SET'
      statusCode = 'ok'
    } else if (isRequired) {
      status = 'MISSING'
      statusCode = 'error'
    } else if (isOptional) {
      status = 'MISSING (optional)'
      statusCode = 'warn'
    } else if (entry && !entry.hasValue) {
      status = 'EMPTY'
      statusCode = 'warn'
    } else {
      status = 'MISSING'
      statusCode = isRequired ? 'error' : 'warn'
    }

    // Extra var not in example
    let extra = false
    if (example && entry && !example.required.has(key) && !example.optional.has(key)) {
      extra = true
    }

    // Format checks
    let formatResults = []
    if (opts.checkFormat && entry) {
      const specificIssues = formatIssues.filter(f => f.key === key)
      formatResults = validateFormat(key, entry, specificIssues)
    }

    const row = {
      key,
      status,
      statusCode,
      extra,
      isRequired,
      isOptional,
      formatIssues: formatResults,
    }

    // Only show unused if --unused is set
    if (!opts.unused && extra && statusCode !== 'error') continue
    if (!opts.unused && isExtra && !isRequired) {
      // skip extras unless --unused
    }

    rows.push(row)
  }

  return { rows, duplicates, parseErrors, formatIssues }
}

// ─── OUTPUT ───────────────────────────────────────────────────────────────────

function formatTypeCheck(key, issues, checkFormat) {
  if (!checkFormat) return '—'
  if (issues.length === 0) return c('green', '✓')

  const labels = issues.map(i => {
    switch (i.type) {
      case 'invalid_url': return 'invalid URL'
      case 'invalid_port': return 'invalid PORT'
      case 'invalid_boolean': return 'expected boolean'
      case 'space_around_eq': return 'space around ='
      case 'unnecessary_quotes': return 'unnecessary quotes'
      case 'invalid_key_format': return 'invalid key format'
      default: return i.type
    }
  })
  return c('yellow', `⚠ ${labels.join(', ')}`)
}

function printTable(rows, opts, duplicates, parseErrors) {
  const COL = { key: 28, status: 24, type: 20 }

  const header = [
    'Variable'.padEnd(COL.key),
    'Status'.padEnd(COL.status),
    opts.checkFormat ? 'Format Check' : '',
  ].filter(Boolean).join('  ')

  const divider = '─'.repeat(header.length)

  console.log()
  console.log(c('bold', header))
  console.log(c('dim', divider))

  for (const row of rows) {
    const keyCol = row.key.padEnd(COL.key)

    let statusStr
    if (row.statusCode === 'ok') {
      statusStr = c('green', `✓ ${row.status}`)
    } else if (row.statusCode === 'error') {
      statusStr = c('red', `✗ ${row.status}`)
    } else {
      statusStr = c('yellow', `⚠ ${row.status}`)
    }

    let extraTag = ''
    if (row.extra && opts.unused) {
      extraTag = c('yellow', ' [EXTRA]')
    }

    const statusCol = (row.status + (row.extra && opts.unused ? ' [EXTRA]' : '')).padEnd(COL.status)
    const typeCol = opts.checkFormat ? formatTypeCheck(row.key, row.formatIssues, opts.checkFormat) : ''

    // Rebuild with colors after padding
    const parts = [keyCol, statusStr + extraTag]
    if (opts.checkFormat) parts.push(typeCol)
    console.log(parts.join('  '))
  }

  console.log(c('dim', divider))

  // Duplicates
  if (opts.checkDuplicates && duplicates.length > 0) {
    console.log()
    console.log(c('yellow', `⚠ Duplicate keys found:`))
    for (const d of duplicates) {
      console.log(`  ${c('bold', d.key)} — first at line ${d.firstLine}, repeated at line ${d.lineNum}`)
    }
  }

  // Parse errors
  if (parseErrors.length > 0) {
    console.log()
    console.log(c('red', `✗ Parse errors:`))
    for (const e of parseErrors) {
      console.log(`  Line ${e.lineNum}: invalid syntax`)
    }
  }
}

function printJson(rows, opts, duplicates, parseErrors) {
  const output = {
    summary: {
      total: rows.length,
      set: rows.filter(r => r.statusCode === 'ok').length,
      missing: rows.filter(r => r.statusCode === 'error').length,
      warnings: rows.filter(r => r.statusCode === 'warn').length,
    },
    variables: rows.map(r => ({
      name: r.key,
      status: r.status,
      required: r.isRequired,
      optional: r.isOptional,
      extra: r.extra,
      formatIssues: r.formatIssues.map(i => i.type),
    })),
    duplicates: duplicates.map(d => ({ name: d.key, lines: [d.firstLine, d.lineNum] })),
    parseErrors: parseErrors.map(e => ({ line: e.lineNum })),
  }
  console.log(JSON.stringify(output, null, 2))
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

function printSummary(rows, opts, duplicates, parseErrors) {
  const missing = rows.filter(r => r.statusCode === 'error')
  const warnings = rows.filter(r => r.statusCode === 'warn')
  const ok = rows.filter(r => r.statusCode === 'ok')

  console.log()

  if (parseErrors.length > 0) {
    console.log(c('red', `✗ ${parseErrors.length} parse error(s)`))
  }

  if (missing.length > 0) {
    console.log(c('red', `✗ ${missing.length} required variable(s) missing`))
    for (const r of missing) {
      console.log(c('red', `  ${r.key} [MISSING]`))
    }
  }

  if (warnings.length > 0) {
    console.log(c('yellow', `⚠ ${warnings.length} warning(s)`))
  }

  if (opts.checkDuplicates && duplicates.length > 0) {
    console.log(c('yellow', `⚠ ${duplicates.length} duplicate key(s)`))
  }

  if (missing.length === 0 && warnings.length === 0 && parseErrors.length === 0) {
    console.log(c('green', `✓ All checks passed (${ok.length} variable(s) set)`))
  }

  console.log()
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function die(msg, code = EXIT.PARSE_ERROR) {
  console.error(c('red', `Error: ${msg}`))
  process.exit(code)
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv)

  if (opts.version) {
    console.log(`dotenv-check v${VERSION}`)
    process.exit(EXIT.OK)
  }

  if (opts.help) {
    printHelp()
    process.exit(EXIT.OK)
  }

  const envPath = resolve(process.cwd(), opts.env)
  const examplePath = resolve(process.cwd(), opts.example)

  if (!existsSync(envPath)) {
    die(`File not found: ${opts.env}`, EXIT.PARSE_ERROR)
  }

  let envData
  try {
    envData = parseEnvFile(envPath)
  } catch (err) {
    die(`Failed to read ${opts.env}: ${err.message}`, EXIT.PARSE_ERROR)
  }

  if (envData.parseErrors.length > 0 && !opts.format === 'json') {
    // Parse errors are shown in output — don't exit early, show full report
  }

  const example = existsSync(examplePath) ? parseExampleFile(examplePath) : null

  const { rows, duplicates, parseErrors } = buildResults(opts, envData, example)

  if (opts.format === 'json') {
    printJson(rows, opts, duplicates, envData.parseErrors)
  } else {
    printTable(rows, opts, duplicates, envData.parseErrors)
    printSummary(rows, opts, duplicates, envData.parseErrors)
  }

  // Exit code logic
  const hasErrors = rows.some(r => r.statusCode === 'error') || envData.parseErrors.length > 0
  const hasWarnings = rows.some(r => r.statusCode === 'warn') ||
    (opts.checkDuplicates && duplicates.length > 0)

  if (hasErrors) process.exit(EXIT.MISSING)
  if (opts.strict && hasWarnings) process.exit(EXIT.MISSING)
  process.exit(EXIT.OK)
}

main()
