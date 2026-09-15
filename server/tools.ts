import { evaluate } from 'mathjs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { config } from './config.js'
import { agentBrowser } from './browser.js'

const execFileAsync = promisify(execFile)
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
})

export const toolDefinitions = [
  tool('get_time', 'Get the current local date and time.', {}),
  tool('calculator', 'Evaluate a mathematical expression.', { expression: { type: 'string' } }, ['expression']),
  tool('list_files', 'List files within the agent workspace.', { path: { type: 'string', description: 'Workspace-relative directory.' } }),
  tool('read_file', 'Read a UTF-8 text file in the workspace.', { path: { type: 'string' } }, ['path']),
  tool('write_file', 'Create or replace a UTF-8 text file in the workspace.', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  tool('run_command', 'Run a non-interactive shell command in the workspace.', { command: { type: 'string' } }, ['command']),
  tool('browser_open', 'Open a URL in the persistent agent browser and return its accessible snapshot.', { url: { type: 'string' } }, ['url']),
  tool('browser_snapshot', 'Read the current page, including stable references for interactive elements.', {}),
  tool('browser_click', 'Click an element reference from the latest browser snapshot.', { ref: { type: 'string', description: 'Reference such as e3.' } }, ['ref']),
  tool('browser_type', 'Fill a visible input. Set submit:true to submit a search with Enter. Returns fresh references.', { ref: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, ['ref', 'text']),
  tool('browser_key', 'Press a key in the active page, such as Enter, Escape, Tab, or ArrowDown.', { key: { type: 'string' } }, ['key']),
  tool('browser_scroll', 'Scroll the active page and return fresh references. Positive pixels scroll down.', { pixels: { type: 'number' } }, ['pixels']),
  tool('browser_switch_tab', 'Switch to a tab index listed in the latest snapshot.', { index: { type: 'integer', minimum: 0 } }, ['index']),
]

function safePath(input = '.') {
  const resolved = path.resolve(config.workspace, input)
  if (resolved !== config.workspace && !resolved.startsWith(config.workspace + path.sep)) throw new Error('Path escapes the agent workspace')
  return resolved
}

export async function executeTool(name: string, args: Record<string, unknown>) {
  await mkdir(config.workspace, { recursive: true })
  switch (name) {
    case 'get_time': return new Date().toString()
    case 'calculator': return String(evaluate(String(args.expression)))
    case 'list_files': return (await readdir(safePath(String(args.path || '.')), { withFileTypes: true })).map((x) => `${x.isDirectory() ? 'dir ' : 'file'} ${x.name}`).join('\n') || '(empty)'
    case 'read_file': return (await readFile(safePath(String(args.path)), 'utf8')).slice(0, 40_000)
    case 'write_file': {
      const destination = safePath(String(args.path)); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, String(args.content), 'utf8'); return `Wrote ${Buffer.byteLength(String(args.content))} bytes to ${args.path}`
    }
    case 'run_command': {
      const command = String(args.command)
      if (/\b(sudo|shutdown|reboot)\b|rm\s+(-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)/i.test(command)) throw new Error('Command blocked by the local safety policy')
      const { stdout, stderr } = await execFileAsync('/bin/zsh', ['-lc', command], { cwd: config.workspace, timeout: 30_000, maxBuffer: 1024 * 1024 })
      return `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`.slice(0, 40_000) || '(command completed without output)'
    }
    case 'browser_open': return agentBrowser.open(String(args.url))
    case 'browser_snapshot': return agentBrowser.snapshot()
    case 'browser_click': return agentBrowser.click(String(args.ref))
    case 'browser_type': return agentBrowser.type(String(args.ref), String(args.text), Boolean(args.submit))
    case 'browser_key': return agentBrowser.input('key', { key: String(args.key) })
    case 'browser_scroll': return agentBrowser.input('wheel', { deltaY: Number(args.pixels) })
    case 'browser_switch_tab': return agentBrowser.switchTab(Number(args.index))
    default: throw new Error(`Unknown tool: ${name}`)
  }
}
