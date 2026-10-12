import { useState, useEffect, type ReactNode } from 'react';
import { sapColors } from '../theme';

interface ThinkingGroupProps {
  children: ReactNode;
  done: boolean;       // true once turn-end has arrived
  toolCount: number;   // number of tool blocks inside, shown in summary
}

const BRAND = sapColors.accent;
const DIM = sapColors.textTrace;
const DIM2 = sapColors.textTrace;

export function ThinkingGroup({ children, done, toolCount }: ThinkingGroupProps) {
  const [open, setOpen] = useState(true);

  // Auto-collapse when the turn completes
  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  if (!done) {
    return (
      <div style={{
        margin: '4px 0',
        padding: '2px 0',
      }}>
        {children}
        <div style={{
          marginTop: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: sapColors.accentBright,
        }}>
          <span style={{
            color: sapColors.accentBright,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: '24px',
            lineHeight: 0.9,
            textShadow: `0 0 12px ${sapColors.glow}`,
            userSelect: 'none',
          }} aria-hidden="true">
            <span style={{ letterSpacing: '0.04em' }}>│</span>
            <span style={{ letterSpacing: '0' }}>╰──</span>
          </span>
          <span style={{
            display: 'inline-flex',
            gap: '4px',
            alignItems: 'center',
          }}>
            <ShimmerDots />
            <span>Running</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: '4px 0',
      padding: '2px 0',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '11px',
          color: DIM2,
          marginBottom: open ? '10px' : 0,
        }}
      >
        <span style={{
          color: BRAND,
          fontSize: '9px',
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
          userSelect: 'none',
        }}>
          ▶
        </span>
        <span style={{ color: sapColors.accentBright, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {open ? 'Hide' : 'Show'} thinking
        </span>
        {!open && toolCount > 0 && (
          <span style={{ color: DIM }}>
            · {toolCount} tool call{toolCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          borderLeft: `1px solid ${sapColors.border}`,
          paddingLeft: '12px',
          marginLeft: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ShimmerDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: sapColors.accentBright,
            display: 'inline-block',
            animation: `shimmerDot 1.2s ease-in-out ${i * 0.2}s infinite`,
            opacity: 0.3,
            boxShadow: `0 0 12px ${sapColors.glow}`,
          }}
        />
      ))}
      <style>{`
        @keyframes shimmerDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
          40% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </span>
  );
}
