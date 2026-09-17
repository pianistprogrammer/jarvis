#!/usr/bin/env bash
# Parse dotenv as data. Never execute the contents of .env as shell commands.
jarvis_env_exports="$(node --input-type=module <<'JS'
import fs from 'node:fs'
import { parse } from 'dotenv'
if (fs.existsSync('.env')) {
  for (const [key, value] of Object.entries(parse(fs.readFileSync('.env')))) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid environment key: ${key}`)
    if (process.env[key] !== undefined) continue
    const quoted = "'" + value.replaceAll("'", "'\\''") + "'"
    console.log(`export ${key}=${quoted}`)
  }
}
JS
)" || return 1
eval "$jarvis_env_exports"
unset jarvis_env_exports
