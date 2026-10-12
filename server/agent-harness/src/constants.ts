import type { ToolDefinition } from './types.js';

export const BASH_TOOL_DEFINITION: ToolDefinition = {
  name: 'execute_bash',
  description: 'Run a bash command inside the session temp workspace. Returns stdout/stderr and exit code.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute.' },
    },
    required: ['command'],
  },
};

export const READ_FILE_TOOL_DEFINITION: ToolDefinition = {
  name: 'read_file',
  description: 'Read a UTF-8 text file. Relative paths resolve from the session workspace; absolute paths, .., ~, and home-relative paths like Desktop/file.html are allowed.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to read. Supports workspace-relative paths, absolute paths, ~, and home-relative paths like Desktop/file.html.' },
      start_line: { type: 'integer', description: 'Optional 1-based starting line.' },
      max_lines: { type: 'integer', description: 'Optional maximum number of lines to return.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
};

export const WRITE_FILE_TOOL_DEFINITION: ToolDefinition = {
  name: 'write_file',
  description: 'Create or overwrite a UTF-8 text file, creating parent directories as needed. Relative paths resolve from the session workspace; absolute paths, .., ~, and home-relative paths like Desktop/file.html are allowed.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to write. Supports workspace-relative paths, absolute paths, ~, and home-relative paths like Desktop/file.html.' },
      content: { type: 'string', description: 'Complete file contents to write.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
};

export const EDIT_FILE_TOOL_DEFINITION: ToolDefinition = {
  name: 'edit_file',
  description: 'Edit a UTF-8 text file by replacing exact text. Relative paths resolve from the session workspace; absolute paths, .., ~, and home-relative paths like Desktop/file.html are allowed. Fails unless old_string matches exactly.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to edit. Supports workspace-relative paths, absolute paths, ~, and home-relative paths like Desktop/file.html.' },
      old_string: { type: 'string', description: 'Exact text to replace.' },
      new_string: { type: 'string', description: 'Replacement text.' },
      replace_all: { type: 'boolean', description: 'Replace all matches instead of requiring a unique match.' },
    },
    required: ['path', 'old_string', 'new_string'],
    additionalProperties: false,
  },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  BASH_TOOL_DEFINITION,
  READ_FILE_TOOL_DEFINITION,
  WRITE_FILE_TOOL_DEFINITION,
  EDIT_FILE_TOOL_DEFINITION,
];

export const FALLBACK_SYSTEM_PROMPT = `You are an agent that can execute bash commands. When you need to run a command, 
respond with ONLY a fenced JSON block in this exact format and nothing else:

\`\`\`json
{"tool": "execute_bash", "input": {"command": "<the bash command>"}}
\`\`\`

When you have a final answer that does not require running a command, respond with plain text.`;

// Matches ```json\n{...}\n``` with tool: execute_bash
export const FALLBACK_JSON_PATTERN = /```json\s*(\{[\s\S]*?"tool"\s*:\s*"execute_bash"[\s\S]*?\})\s*```/;
