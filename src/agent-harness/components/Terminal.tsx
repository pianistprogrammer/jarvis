import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { sapColors } from '../theme';

export interface TerminalHandle {
  write(text: string): void;
  writeln(text: string): void;
}

export const Terminal = forwardRef<TerminalHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      scrollback: 5000,
      scrollOnUserInput: false,
      theme: {
        background: sapColors.appBackground,
        foreground: sapColors.text,
        black: sapColors.appBackground,
        brightBlack: sapColors.textDim,
        cursor: sapColors.accentBright,
        cursorAccent: sapColors.appBackground,
        selectionBackground: 'rgba(77, 177, 255, 0.28)',
      },
      fontFamily: 'ui-monospace, "SF Mono", Menlo, "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.6,
      letterSpacing: 0.3,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    write(text: string) {
      termRef.current?.write(text, () => {
        termRef.current?.scrollToBottom();
      });
    },
    writeln(text: string) {
      termRef.current?.writeln(text, () => {
        termRef.current?.scrollToBottom();
      });
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', backgroundColor: sapColors.appBackground }}
    />
  );
});

Terminal.displayName = 'Terminal';
