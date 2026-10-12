import { sapColors } from '../theme';

interface HeaderProps {
  workspacePath: string;
  modelInfo: string;
  isConnected: boolean;
  isThinking: boolean;
}

const BRAND = sapColors.accent;

export function Header({ workspacePath, modelInfo, isConnected, isThinking }: HeaderProps) {
  const model = modelInfo || '—';
  const ws = workspacePath ? workspacePath.split('/').pop() : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: '42px',
      backgroundColor: 'rgba(0,0,0,0.82)',
      borderBottom: `1px solid ${sapColors.border}`,
      flexShrink: 0,
      userSelect: 'none',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Left: mark + title + model */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: BRAND, fontSize: '16px', lineHeight: 1, fontWeight: 700 }}>◆</span>
        <span style={{
          color: sapColors.text,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}>
          Agent Terminal
        </span>
        <span style={{ color: sapColors.borderStrong, fontSize: '13px' }}>│</span>
        <span style={{
          color: sapColors.textDim,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '11px',
          textShadow: `0 0 12px ${sapColors.glowSoft}`,
        }}>
          {model}
        </span>
      </div>

      {/* Right: workspace pill + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {ws && (
          <span style={{
            color: sapColors.textDim,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '11px',
            backgroundColor: sapColors.surface,
            padding: '2px 8px',
            borderRadius: '999px',
            border: `1px solid ${sapColors.borderStrong}`,
            boxShadow: `0 0 18px ${sapColors.glowSoft}`,
          }}>
            ~/{ws}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          {isThinking ? (
            <>
              <SpinnerIcon />
              <span style={{
                color: BRAND,
                fontSize: '11px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }}>
                running
              </span>
            </>
          ) : (
            <>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isConnected ? sapColors.success : sapColors.danger,
                display: 'inline-block',
                flexShrink: 0,
                boxShadow: isConnected ? '0 0 6px rgba(48,145,76,0.5)' : 'none',
              }} />
              <span style={{
                color: sapColors.textDim,
                fontSize: '11px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }}>
                {isConnected ? 'ready' : 'offline'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="6.5" cy="6.5" r="5" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" fill="none" />
      <path
        d="M6.5 1.5 A5 5 0 0 1 11.5 6.5"
        stroke="rgb(158,94,255)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
