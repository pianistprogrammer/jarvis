import type { Message } from '../../types';
import { sapColors } from '../../theme';

interface ToolBlockProps {
  callMessage: Message & { data: { kind: 'tool-call'; toolName: string; summary: string; toolId: string } };
  end: (Message & { data: { kind: 'tool-end'; toolId: string; ok: boolean; summary: string; diff?: string } }) | null;
}

function toolLabel(name: string) {
  switch (name) {
    case 'read_file':
      return 'Read';
    case 'write_file':
      return 'Write';
    case 'edit_file':
      return 'Edit';
    default:
      return name;
  }
}

function diffLineColor(line: string) {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return sapColors.textDim;
  if (line.startsWith('+')) return 'rgb(100, 210, 120)';
  if (line.startsWith('-')) return sapColors.dangerBright;
  return sapColors.textTrace;
}

function diffLineBackground(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'rgba(48, 145, 76, 0.12)';
  if (line.startsWith('-') && !line.startsWith('---')) return sapColors.dangerSoft;
  return 'transparent';
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <div style={{
      marginTop: '10px',
      borderTop: `1px solid ${sapColors.border}`,
      paddingTop: '10px',
      overflowX: 'auto',
    }}>
      <pre style={{
        margin: 0,
        fontFamily: 'inherit',
        fontSize: '12px',
        lineHeight: '1.5',
      }}>
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              color: diffLineColor(line),
              backgroundColor: diffLineBackground(line),
              padding: '0 6px',
              whiteSpace: 'pre',
            }}
          >
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function ToolBlock({ callMessage, end }: ToolBlockProps) {
  const ok = end?.data.ok;
  const diff = end?.data.diff;

  return (
    <div style={{
      margin: '6px 0 10px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      backgroundColor: sapColors.surface,
      border: `1px solid ${ok === false ? sapColors.dangerBorder : sapColors.border}`,
      borderRadius: '12px',
      padding: '10px 12px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: sapColors.accentBright,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '5px',
          }}>
            {toolLabel(callMessage.data.toolName)}
          </div>
          <div style={{
            color: sapColors.textTrace,
            fontSize: '12px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {end?.data.summary ?? callMessage.data.summary}
          </div>
        </div>
        <div style={{
          color: ok === undefined ? sapColors.textDim : ok ? sapColors.success : sapColors.dangerBright,
          fontSize: '11px',
          whiteSpace: 'nowrap',
        }}>
          {ok === undefined ? 'running' : ok ? 'done' : 'error'}
        </div>
      </div>
      {diff && <DiffView diff={diff} />}
    </div>
  );
}
