import { sapColors } from '../../theme';

interface UserMessageProps {
  text: string;
}

export function UserMessage({ text }: UserMessageProps) {
  return (
    <div style={{
      margin: '12px 0 8px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '13px',
      color: sapColors.text,
      display: 'flex',
      justifyContent: 'flex-end',
    }}>
      <div style={{
        maxWidth: '720px',
        padding: '14px 16px',
        borderRadius: '20px',
        backgroundColor: 'rgba(8,8,8,0.92)',
        border: `1px solid ${sapColors.borderStrong}`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 14px 30px rgba(0,0,0,0.34), 0 0 22px ${sapColors.glowSoft}`,
      }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6' }}>{text}</div>
      </div>
    </div>
  );
}
