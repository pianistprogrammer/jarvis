import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface ToolExecutionResult {
  output: string;
  isError: boolean;
  summary: string;
  diff?: string;
}

interface ReadFileInput {
  path?: unknown;
  start_line?: unknown;
  max_lines?: unknown;
}

interface WriteFileInput {
  path?: unknown;
  content?: unknown;
}

interface EditFileInput {
  path?: unknown;
  old_string?: unknown;
  new_string?: unknown;
  replace_all?: unknown;
}

const DIFF_CONTEXT_LINES = 3;
const MAX_DIFF_LINES = 240;
const HOME_RELATIVE_DIRS = new Set([
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
  'Music',
  'Pictures',
  'Public',
]);

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object.');
  }
  return input as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function expandHomePath(requestedPath: string): string {
  if (requestedPath === '~') return os.homedir();
  if (requestedPath.startsWith(`~${path.sep}`) || requestedPath.startsWith('~/')) {
    return path.join(os.homedir(), requestedPath.slice(2));
  }
  return requestedPath;
}

function pathParts(value: string): string[] {
  return value.split(/[\\/]+/).filter(Boolean);
}

function homeRelativePath(value: string): string | undefined {
  const parts = pathParts(value);
  const homeDirIndex = parts.findIndex((part) => HOME_RELATIVE_DIRS.has(part));
  if (homeDirIndex === -1) return undefined;
  return path.join(os.homedir(), ...parts.slice(homeDirIndex));
}

function resolveToolPath(workspace: string, requestedPath: string): string {
  if (!requestedPath.trim()) {
    throw new Error('path must not be empty.');
  }
  if (requestedPath.includes('\0')) {
    throw new Error('path must not contain null bytes.');
  }

  const expandedPath = expandHomePath(requestedPath);
  const workspaceRoot = path.resolve(workspace);
  const homePath = homeRelativePath(expandedPath);

  if (!path.isAbsolute(expandedPath) && homePath && pathParts(expandedPath)[0] && HOME_RELATIVE_DIRS.has(pathParts(expandedPath)[0])) {
    return path.resolve(homePath);
  }

  return path.resolve(path.isAbsolute(expandedPath) ? expandedPath : path.join(workspaceRoot, expandedPath));
}

async function resolveExistingToolPath(workspace: string, requestedPath: string): Promise<string> {
  const primaryPath = resolveToolPath(workspace, requestedPath);
  try {
    await fs.access(primaryPath);
    return primaryPath;
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  const homePath = homeRelativePath(expandHomePath(requestedPath));
  if (homePath && path.resolve(homePath) !== primaryPath) {
    try {
      await fs.access(homePath);
      return path.resolve(homePath);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }
  }

  return primaryPath;
}

function displayPath(workspace: string, resolvedPath: string): string {
  const workspaceRoot = path.resolve(workspace);
  if (resolvedPath === workspaceRoot || resolvedPath.startsWith(workspaceRoot + path.sep)) {
    return path.relative(workspaceRoot, resolvedPath) || '.';
  }
  return resolvedPath;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = 0;

  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function withLineWindow(content: string, startLine?: number, maxLines?: number): { text: string; summarySuffix: string } {
  if (startLine === undefined && maxLines === undefined) {
    return { text: content, summarySuffix: '' };
  }

  const lines = content.split('\n');
  const startIndex = (startLine ?? 1) - 1;
  const endIndex = maxLines === undefined ? lines.length : startIndex + maxLines;
  const selected = lines.slice(startIndex, endIndex).join('\n');
  const shownEnd = Math.min(endIndex, lines.length);

  return {
    text: selected,
    summarySuffix: ` lines ${startIndex + 1}-${shownEnd} of ${lines.length}`,
  };
}

function splitForDiff(content: string): string[] {
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function unchangedLabel(count: number, position: 'before' | 'after'): string {
  return `... ${count} unchanged line${count === 1 ? '' : 's'} ${position}`;
}

function previewText(content: string, maxLines = 8): string {
  const lines = splitForDiff(content).slice(0, maxLines);
  const suffix = splitForDiff(content).length > maxLines ? `\n... preview truncated after ${maxLines} lines` : '';
  return lines.join('\n') + suffix;
}

function createLineDiff(oldContent: string, newContent: string, shownPath: string, oldExists = true): string {
  if (oldContent === newContent) return '';

  const oldLines = splitForDiff(oldContent);
  const newLines = splitForDiff(newContent);
  let prefixLength = 0;

  while (
    prefixLength < oldLines.length
    && prefixLength < newLines.length
    && oldLines[prefixLength] === newLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < oldLines.length - prefixLength
    && suffixLength < newLines.length - prefixLength
    && oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const diffLines = [
    `--- ${oldExists ? shownPath : '/dev/null'}`,
    `+++ ${shownPath}`,
    '@@',
  ];

  const leadingContextStart = Math.max(0, prefixLength - DIFF_CONTEXT_LINES);
  const trailingContextCount = Math.min(DIFF_CONTEXT_LINES, suffixLength);
  const trailingContextStart = oldLines.length - suffixLength;

  if (leadingContextStart > 0) {
    diffLines.push(unchangedLabel(leadingContextStart, 'before'));
  }

  for (const line of oldLines.slice(leadingContextStart, prefixLength)) diffLines.push(` ${line}`);
  for (const line of oldLines.slice(prefixLength, oldLines.length - suffixLength)) diffLines.push(`-${line}`);
  for (const line of newLines.slice(prefixLength, newLines.length - suffixLength)) diffLines.push(`+${line}`);
  for (const line of oldLines.slice(trailingContextStart, trailingContextStart + trailingContextCount)) diffLines.push(` ${line}`);

  const trailingOmitted = suffixLength - trailingContextCount;
  if (trailingOmitted > 0) {
    diffLines.push(unchangedLabel(trailingOmitted, 'after'));
  }

  if (diffLines.length > MAX_DIFF_LINES) {
    return diffLines.slice(0, MAX_DIFF_LINES).concat(`... diff truncated after ${MAX_DIFF_LINES} lines`).join('\n');
  }

  return diffLines.join('\n');
}

async function readExistingFile(resolvedPath: string): Promise<{ exists: boolean; content: string }> {
  try {
    return { exists: true, content: await fs.readFile(resolvedPath, 'utf8') };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, content: '' };
    }
    throw error;
  }
}

export function summarizeFileToolCall(toolName: string | undefined, input: unknown): string {
  const data = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const target = typeof data['path'] === 'string' && data['path'].trim()
    ? data['path'].trim()
    : '(missing path)';

  switch (toolName) {
    case 'read_file':
      return `read ${target}`;
    case 'write_file':
      return `write ${target}`;
    case 'edit_file':
      return `edit ${target}`;
    default:
      return `${toolName ?? 'tool'} ${target}`;
  }
}

export async function runFileTool(workspace: string, toolName: string | undefined, input: unknown): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case 'read_file':
        return await readFile(workspace, asObject(input) as ReadFileInput);
      case 'write_file':
        return await writeFile(workspace, asObject(input) as WriteFileInput);
      case 'edit_file':
        return await editFile(workspace, asObject(input) as EditFileInput);
      default:
        return {
          output: `Unknown tool: ${toolName ?? '(missing name)'}`,
          isError: true,
          summary: 'unknown tool',
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Tool error: ${message}`,
      isError: true,
      summary: message,
    };
  }
}

async function readFile(workspace: string, input: ReadFileInput): Promise<ToolExecutionResult> {
  const requestedPath = requiredString(input.path, 'path');
  const resolvedPath = await resolveExistingToolPath(workspace, requestedPath);
  const startLine = optionalPositiveInteger(input.start_line, 'start_line');
  const maxLines = optionalPositiveInteger(input.max_lines, 'max_lines');
  const content = await fs.readFile(resolvedPath, 'utf8');
  const windowed = withLineWindow(content, startLine, maxLines);
  const shownPath = displayPath(workspace, resolvedPath);

  return {
    output: `File: ${shownPath}${windowed.summarySuffix}\n\n${windowed.text}`,
    isError: false,
    summary: `read ${shownPath}`,
  };
}

async function writeFile(workspace: string, input: WriteFileInput): Promise<ToolExecutionResult> {
  const requestedPath = requiredString(input.path, 'path');
  const content = requiredString(input.content, 'content');
  const resolvedPath = resolveToolPath(workspace, requestedPath);
  const previous = await readExistingFile(resolvedPath);
  const shownPath = displayPath(workspace, resolvedPath);
  const diff = createLineDiff(previous.content, content, shownPath, previous.exists);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, content, 'utf8');

  return {
    output: `Wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${shownPath}.${diff ? `\n\nDiff:\n${diff}` : '\nNo textual changes.'}`,
    isError: false,
    summary: `wrote ${shownPath}`,
    diff,
  };
}

async function editFile(workspace: string, input: EditFileInput): Promise<ToolExecutionResult> {
  const requestedPath = requiredString(input.path, 'path');
  const oldString = requiredString(input.old_string, 'old_string');
  const newString = requiredString(input.new_string, 'new_string');
  const replaceAll = input.replace_all === true;

  if (oldString.length === 0) {
    throw new Error('old_string must not be empty.');
  }

  const resolvedPath = await resolveExistingToolPath(workspace, requestedPath);
  const original = await fs.readFile(resolvedPath, 'utf8');
  const occurrences = countOccurrences(original, oldString);
  const shownPath = displayPath(workspace, resolvedPath);

  if (occurrences === 0) {
    return {
      output: `Tool error: old_string was not found in ${shownPath}. Read the file and retry with an exact substring.\n\nFile preview:\n${previewText(original)}`,
      isError: true,
      summary: `old_string not found in ${shownPath}`,
    };
  }
  if (!replaceAll && occurrences > 1) {
    throw new Error(`old_string matched ${occurrences} times; set replace_all to true or provide a more specific old_string.`);
  }

  const updated = replaceAll
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString);

  await fs.writeFile(resolvedPath, updated, 'utf8');
  const diff = createLineDiff(original, updated, shownPath);

  return {
    output: `Edited ${shownPath}. Replaced ${replaceAll ? occurrences : 1} occurrence${(replaceAll ? occurrences : 1) === 1 ? '' : 's'}.${diff ? `\n\nDiff:\n${diff}` : '\nNo textual changes.'}`,
    isError: false,
    summary: `edited ${shownPath}`,
    diff,
  };
}
