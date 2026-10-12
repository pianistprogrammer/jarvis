import { sapColors } from '../theme';

interface WelcomeScreenProps {
  workspacePath: string;
  modelInfo: string;
}

const BRAND = sapColors.accent;
const DIM = 'rgb(191, 212, 232)';
const DIM_SOFT = 'rgb(166, 192, 218)';
const TEXT = sapColors.text;

// Pixel art mascot in the app accent color.
function PixelMascot() {
  // 16x16 pixel grid.
  const pixels = [
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '..OOOOOOOOOOOO..',
    '..OOOOOOOOOOOO..',
    '..OO..OOOO..OO..',
    '..OOOOOOOOOOOO..',
    '..OOOOOOOOOOOO..',
    '...OOOOOOOOOO...',
    '....OOOOOOOO....',
    '...OOOO..OOOO...',
    '..OOOO....OOOO..',
    '..OOO......OOO..',
  ];
  const PX = 10;
  return (
    <svg width={16 * PX} height={pixels.length * PX} viewBox={`0 0 ${16 * PX} ${pixels.length * PX}`}>
      {pixels.map((row, y) =>
        row.split('').map((cell, x) =>
          cell === 'O' ? (
            <rect key={`${x}-${y}`} x={x * PX} y={y * PX} width={PX} height={PX} fill={BRAND} />
          ) : null
        )
      )}
    </svg>
  );
}

export function WelcomeScreen({ workspacePath, modelInfo }: WelcomeScreenProps) {
  const ws = workspacePath
    ? workspacePath.replace(/^\/var\/folders\/[^/]+\/[^/]+\/T\//, '~/tmp/')
    : '~';

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      overflow: 'hidden',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '760px',
        position: 'relative',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, "Cascadia Code", Consolas, monospace',
      }}>
        <div style={{
          position: 'absolute',
          inset: 'auto 22px -18px 22px',
          height: '132px',
          borderRadius: '34px',
          background: `linear-gradient(180deg, rgba(158, 94, 255, 0.95), rgba(123, 60, 227, 0.92))`,
          boxShadow: `0 0 60px ${sapColors.glow}, 0 22px 60px rgba(118, 58, 221, 0.42)`,
          filter: 'saturate(1.12)',
        }} />
        <div style={{
          position: 'relative',
          border: `1px solid ${sapColors.borderStrong}`,
          borderRadius: '34px',
          backgroundColor: 'rgba(3, 3, 4, 0.98)',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 18px 56px rgba(0,0,0,0.68)`,
          overflow: 'hidden',
        }}>
        <div style={{
          borderBottom: `1px solid ${sapColors.borderStrong}`,
          padding: '0 18px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: sapColors.accentBright, boxShadow: `0 0 16px ${sapColors.glow}` }} />
          <span style={{ color: sapColors.text, fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Agent Terminal
          </span>
        </div>

        <div style={{ display: 'flex' }}>
          {/* Left column */}
          <div style={{
            flex: '0 0 250px',
            borderRight: `1px solid ${sapColors.border}`,
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '22px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT, letterSpacing: '0.02em' }}>
              Welcome back!
            </div>
            <div style={{
              width: '100%',
              minHeight: '180px',
              borderRadius: '28px',
              border: `1px solid ${sapColors.borderStrong}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0))',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 34px ${sapColors.glowSoft}`,
            }}>
              <PixelMascot />
            </div>
            <div style={{ textAlign: 'center', fontSize: '12px', color: DIM, lineHeight: '1.7' }}>
              <div>{modelInfo || 'ollama'}</div>
              <div>{ws}</div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={{ color: sapColors.accentBright, fontWeight: 700, fontSize: '11px', marginBottom: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Tips for getting started
              </div>
              <div style={{ color: DIM, fontSize: '12px', lineHeight: '1.8' }}>
                {[
                  'Ask the agent to create and run scripts',
                  'Try: "write a python file and run it"',
                  'Try: "what tools are available here?"',
                  'Each session gets an isolated workspace',
                  'Commands time out after 60 seconds',
                ].map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', padding: '6px 0' }}>
                    <span style={{ color: sapColors.accentBright, userSelect: 'none' }}>·</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${sapColors.border}`, paddingTop: '18px' }}>
              <div style={{ color: sapColors.accentBright, fontWeight: 700, fontSize: '11px', marginBottom: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Provider
              </div>
              <div style={{ color: DIM, fontSize: '12px', lineHeight: '1.8' }}>
                {[
                  'Ollama  (local — default)',
                ].map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', padding: '6px 0' }}>
                    <span style={{ color: sapColors.accentBright, userSelect: 'none' }}>·</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          borderTop: `1px solid ${sapColors.border}`,
          padding: '12px 18px',
          fontSize: '11px',
          color: DIM_SOFT,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>type a prompt below to start</span>
          <span style={{ color: DIM_SOFT }}>enter ↵ to send</span>
        </div>
        </div>
      </div>
    </div>
  );
}
