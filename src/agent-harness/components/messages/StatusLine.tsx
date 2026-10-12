import { sapColors } from '../../theme';

interface StatusLineProps {
  text: string;
}

function getStatusTone(text: string) {
  const normalized = text.toLowerCase();

  if (normalized.includes('connected') || normalized.includes('ready')) {
    return {
      color: sapColors.success,
      backgroundColor: 'rgba(48, 145, 76, 0.12)',
      borderColor: 'rgba(48, 145, 76, 0.35)',
    };
  }

  if (normalized.includes('disconnected') || normalized.includes('offline')) {
    return {
      color: sapColors.danger,
      backgroundColor: 'rgba(187, 0, 0, 0.10)',
      borderColor: 'rgba(187, 0, 0, 0.28)',
    };
  }

  if (normalized.includes('workspace')) {
    return {
      color: sapColors.text,
      backgroundColor: 'rgba(6,6,6,0.96)',
      borderColor: sapColors.borderStrong,
    };
  }

  return {
    color: sapColors.textMuted,
    backgroundColor: 'rgba(6,6,6,0.96)',
    borderColor: sapColors.borderStrong,
  };
}

export function StatusLine({ text }: StatusLineProps) {
  const tone = getStatusTone(text);

  return (
    <div style={{
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '11px',
      color: tone.color,
      padding: '6px 10px',
      lineHeight: '1.5',
      borderRadius: '999px',
      border: `1px solid ${tone.borderColor}`,
      backgroundColor: tone.backgroundColor,
      width: 'fit-content',
      letterSpacing: '0.03em',
    }}>
      {text}
    </div>
  );
}
