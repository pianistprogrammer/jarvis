import { useState } from 'react';
import type { Message } from '../../types';
import { sapColors } from '../../theme';

interface BashBlockProps {
  cmdMessage: Message & { data: { kind: 'bash-cmd'; command: string; cmdId: string } };
  outputs: Array<Message & { data: { kind: 'bash-out'; text: string; stream: 'stdout' | 'stderr'; cmdId: string } }>;
  end: (Message & { data: { kind: 'bash-end'; exitCode: number; cmdId: string } }) | null;
}

const COLLAPSED_LINES = 5;
const BRAND = sapColors.accent;
const SUCCESS = sapColors.success;
const ERR = sapColors.dangerBright;
const STDOUT = sapColors.textTrace;
const DIM = sapColors.textMuted;
const DIM2 = sapColors.textTrace;

function truncateCommand(cmd: string, max = 60) {
  return cmd.length > max ? cmd.slice(0, max) + '…' : cmd;
}

export function BashBlock({ cmdMessage, outputs, end }: BashBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // Merge all output chunks into a single string split by lines
  const fullText = outputs.map(o => o.data.text).join('');
  const allLines = fullText.split('\n');
  // Remove trailing empty line from split
  if (allLines[allLines.length - 1] === '') allLines.pop();

  const isLong = allLines.length > COLLAPSED_LINES;
  const visibleLines = isLong && !expanded ? allLines.slice(0, COLLAPSED_LINES) : allLines;
  const hiddenCount = allLines.length - COLLAPSED_LINES;

  // Determine color per line based on which output chunk it came from
  // Rebuild a line→stream map
  const lineStreams: Array<'stdout' | 'stderr'> = [];
  let cursor = 0;
  for (const o of outputs) {
    const lines = o.data.text.split('\n');
    const count = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    for (let i = 0; i < count; i++) {
      lineStreams[cursor++] = o.data.stream;
    }
  }

  const exitCode = end?.data.exitCode ?? null;

  return (
    <div style={{
      margin: '6px 0 10px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      backgroundColor: sapColors.appBackground,
      border: `1px solid ${sapColors.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: '12px',
        color: DIM2,
        marginBottom: '3px',
        lineHeight: '1.5',
        padding: '10px 12px',
        borderBottom: `1px solid ${sapColors.border}`,
        backgroundColor: sapColors.surface,
      }}>
        <span style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shell</span>
        <span style={{ color: DIM }}> · </span>
        <span style={{ color: DIM2 }}>{truncateCommand(cmdMessage.data.command)}</span>
      </div>

      {visibleLines.length > 0 && (
        <div style={{
          padding: '12px 16px 4px',
          fontSize: '12px',
          lineHeight: '1.55',
          color: STDOUT,
        }}>
          {visibleLines.map((line, i) => (
            <div
              key={i}
              style={{
                color: lineStreams[i] === 'stderr' ? ERR : STDOUT,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                minHeight: '1em',
              }}
            >
              {line || ' '}
            </div>
          ))}
        </div>
      )}

      {/* Collapse / expand toggle */}
      {isLong && (
        <div style={{ padding: '0 16px 8px', marginTop: '2px' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              color: DIM2,
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {expanded
              ? '− collapse output'
              : `+${hiddenCount} line${hiddenCount === 1 ? '' : 's'} · click to expand`}
          </button>
        </div>
      )}

      {/* Footer: exit code + "Allowed by..." */}
      <div style={{
        padding: '8px 16px 12px',
        marginTop: '3px',
        fontSize: '11px',
        color: DIM,
        lineHeight: '1.5',
        display: 'flex',
        gap: '10px',
      }}>
        {exitCode !== null && (
          <span style={{ color: exitCode === 0 ? SUCCESS : ERR }}>
            {exitCode === 0 ? '✓' : '✗'} exit {exitCode}
          </span>
        )}
        <span>Allowed by auto mode</span>
      </div>
    </div>
  );
}
