import { sapColors } from '../theme';

interface ConfigPanelProps {
  workspacePath: string;
  modelInfo: string;
  isConnected: boolean;
}

export function ConfigPanel({ workspacePath, modelInfo, isConnected }: ConfigPanelProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '8px 12px',
      backgroundColor: sapColors.surface,
      borderBottom: `1px solid ${sapColors.border}`,
      fontSize: '12px',
      fontFamily: 'monospace',
      color: sapColors.textDim,
      flexWrap: 'wrap',
    }}>
      <span style={{ color: isConnected ? sapColors.success : sapColors.danger }}>
        ● {isConnected ? 'Connected' : 'Disconnected'}
      </span>
      {modelInfo && <span>Model: <span style={{ color: sapColors.textMuted }}>{modelInfo}</span></span>}
      {workspacePath && <span>Workspace: <span style={{ color: sapColors.textMuted }}>{workspacePath}</span></span>}
    </div>
  );
}
