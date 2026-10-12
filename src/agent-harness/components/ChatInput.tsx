import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { sapColors } from '../theme';

interface ChatInputProps {
  onSubmit: (value: string) => void;
  disabled: boolean;   // true = no connection
  isThinking: boolean; // true = agent running (input still active)
  currentProvider: string;
  currentModel: string;
  onUpdateRuntimeConfig: (patch: { provider?: string; model?: string }) => Promise<{ provider: string; model: string }>;
  onLoadModels: (provider?: string) => Promise<string[]>;
  onExitSession: () => void;
}

const BRAND = sapColors.accent;
const DIM = sapColors.textDim;
const PROVIDER_OPTIONS = ['ollama'] as const;

export function ChatInput({
  onSubmit,
  disabled,
  isThinking,
  currentProvider,
  currentModel,
  onUpdateRuntimeConfig,
  onLoadModels,
  onExitSession,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [commandMenu, setCommandMenu] = useState<'model' | 'provider' | null>(null);
  const [menuError, setMenuError] = useState('');
  const [menuBusy, setMenuBusy] = useState(false);
  const [modelDraft, setModelDraft] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, [value]);

  useEffect(() => {
    if (commandMenu === 'model') {
      setModelDraft(currentModel);
    }
  }, [commandMenu, currentModel]);

  async function openModelMenu(provider = currentProvider) {
    setCommandMenu('model');
    setMenuError('');
    setMenuBusy(true);
    setModelDraft(currentModel);
    try {
      setAvailableModels(await onLoadModels(provider));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMenuError(message);
      setAvailableModels([]);
    } finally {
      setMenuBusy(false);
    }
  }

  function openProviderMenu() {
    setCommandMenu('provider');
    setMenuError('');
    setMenuBusy(false);
  }

  function closeMenu() {
    setCommandMenu(null);
    setMenuError('');
    setMenuBusy(false);
  }

  async function applyProvider(provider: string) {
    setMenuBusy(true);
    setMenuError('');
    try {
      const next = await onUpdateRuntimeConfig({ provider });
      await openModelMenu(next.provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMenuError(message);
      setMenuBusy(false);
    }
  }

  async function applyModel(model: string) {
    const trimmed = model.trim();
    if (!trimmed) return;

    setMenuBusy(true);
    setMenuError('');
    try {
      await onUpdateRuntimeConfig({ model: trimmed });
      closeMenu();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMenuError(message);
      setMenuBusy(false);
    }
  }

  function submit() {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();

    if (normalized === '/model') {
      void openModelMenu();
      setValue('');
      return;
    }

    if (normalized === '/provider' || normalized === '/privider') {
      openProviderMenu();
      setValue('');
      return;
    }

    if (normalized === '/exit') {
      closeMenu();
      setValue('');
      onExitSession();
      return;
    }

    if (trimmed && !disabled) {
      onSubmit(trimmed);
      setValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      setValue('');
      onExitSession();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const placeholder = disabled
    ? 'disconnected'
    : isThinking
    ? 'steer the agent… (sent mid-run)'
    : 'Ask the agent…';

  return (
    <div style={{
      borderTop: `1px solid ${sapColors.border}`,
      backgroundColor: sapColors.appBackground,
      flexShrink: 0,
    }}>
      {commandMenu && (
        <div style={{
          maxWidth: '980px',
          margin: '0 auto',
          padding: '12px 20px 0',
        }}>
          <div style={{
            border: `1px solid ${sapColors.borderStrong}`,
            backgroundColor: 'rgba(6,6,6,0.96)',
            borderRadius: '22px',
            padding: '14px',
            boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 20px 54px rgba(0,0,0,0.66), 0 0 30px ${sapColors.glowSoft}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div>
                <div style={{
                  color: sapColors.accentBright,
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  marginBottom: '4px',
                }}>
                  {commandMenu === 'provider' ? 'Switch provider' : 'Switch model'}
                </div>
                <div style={{
                  color: sapColors.textMuted,
                  fontSize: '12px',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                }}>
                  Current: {currentProvider || '—'} · {currentModel || '—'}
                </div>
              </div>
              <button
                onClick={closeMenu}
                style={menuSecondaryButtonStyle}
              >
                Close
              </button>
            </div>

            {commandMenu === 'provider' ? (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {PROVIDER_OPTIONS.map((provider) => (
                  <button
                    key={provider}
                    onClick={() => void applyProvider(provider)}
                    disabled={menuBusy}
                    style={{
                      ...menuOptionButtonStyle,
                      borderColor: provider === currentProvider ? sapColors.accentBright : sapColors.border,
                      color: provider === currentProvider ? sapColors.text : sapColors.textMuted,
                      backgroundColor: provider === currentProvider ? sapColors.surfaceRaised : sapColors.appBackground,
                      opacity: menuBusy ? 0.7 : 1,
                    }}
                  >
                    {provider}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {availableModels.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {availableModels.map((model) => (
                      <button
                        key={model}
                        onClick={() => void applyModel(model)}
                        disabled={menuBusy}
                        style={{
                          ...menuOptionButtonStyle,
                          borderColor: model === currentModel ? sapColors.accentBright : sapColors.border,
                          color: sapColors.text,
                          backgroundColor: model === currentModel ? sapColors.surfaceRaised : sapColors.appBackground,
                          opacity: menuBusy ? 0.7 : 1,
                        }}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    placeholder="Enter model name"
                    style={{
                      flex: '1 1 340px',
                      minWidth: '240px',
                      borderRadius: '10px',
                      border: `1px solid ${sapColors.border}`,
                      backgroundColor: sapColors.appBackground,
                      color: sapColors.text,
                      padding: '10px 12px',
                      outline: 'none',
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={() => void applyModel(modelDraft)}
                    disabled={menuBusy || !modelDraft.trim()}
                    style={{
                      ...menuPrimaryButtonStyle,
                      opacity: menuBusy || !modelDraft.trim() ? 0.7 : 1,
                    }}
                  >
                    {menuBusy ? 'Applying…' : 'Apply model'}
                  </button>
                </div>
              </>
            )}

            {menuError && (
              <div style={{
                color: sapColors.danger,
                backgroundColor: 'rgba(187, 0, 0, 0.08)',
                border: '1px solid rgba(187, 0, 0, 0.28)',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }}>
                {menuError}
              </div>
            )}

            <div style={{
              color: sapColors.textDim,
              fontSize: '11px',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}>
              Slash commands: /model opens model selection, /provider confirms Ollama, /exit starts a fresh session.
            </div>
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={{
        maxWidth: '980px',
        margin: '0 auto',
        padding: '12px 20px 14px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          padding: '14px 16px',
          border: `1px solid ${sapColors.borderStrong}`,
          backgroundColor: 'rgba(6,6,6,0.95)',
          borderRadius: '22px',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 -8px 28px rgba(0, 0, 0, 0.24), 0 0 24px ${sapColors.glowSoft}`,
        }}>
          <span style={{
            color: disabled ? DIM : isThinking ? sapColors.textMuted : BRAND,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '11px',
            lineHeight: '1',
            padding: '6px 8px',
            borderRadius: '999px',
            backgroundColor: sapColors.appBackground,
            border: `1px solid ${sapColors.borderStrong}`,
            flexShrink: 0,
            userSelect: 'none',
            transition: 'color 0.2s',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {isThinking ? 'steer' : 'prompt'}
          </span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              color: sapColors.text,
              border: 'none',
              outline: 'none',
              padding: '2px 0',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: '13px',
              lineHeight: '1.6',
              resize: 'none',
              overflowY: 'hidden',
              caretColor: BRAND,
            }}
          />
          {value.trim() && !disabled && (
            <button
              onClick={submit}
              title={isThinking ? 'Steer agent (Enter)' : 'Send (Enter)'}
              style={{
                flexShrink: 0,
                minWidth: '74px',
                height: '34px',
                borderRadius: '999px',
                border: `1px solid ${isThinking ? sapColors.borderStrong : sapColors.accentBright}`,
                backgroundColor: isThinking ? sapColors.surfaceAlt : 'rgba(158, 94, 255, 0.14)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '0 12px',
                transition: 'background-color 0.2s',
                fontSize: '11px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                boxShadow: `0 0 18px ${sapColors.glowSoft}`,
              }}
            >
              {isThinking ? 'Steer' : 'Send'}
            </button>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div style={{
        maxWidth: '980px',
        margin: '0 auto',
        paddingBottom: '10px',
        paddingLeft: '20px',
        paddingRight: '20px',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '10px',
        color: sapColors.textDim,
        lineHeight: '1',
      }}>
        enter to send · shift+enter for newline · commands run in an isolated workspace
      </div>
    </div>
  );
}

const menuOptionButtonStyle = {
  borderRadius: '10px',
  border: `1px solid ${sapColors.border}`,
  backgroundColor: sapColors.appBackground,
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: '12px',
};

const menuPrimaryButtonStyle = {
  borderRadius: '10px',
  border: `1px solid ${sapColors.accent}`,
  backgroundColor: sapColors.accent,
  color: '#fff',
  padding: '10px 14px',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

const menuSecondaryButtonStyle = {
  borderRadius: '10px',
  border: `1px solid ${sapColors.border}`,
  backgroundColor: sapColors.appBackground,
  color: sapColors.textMuted,
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: '12px',
};
