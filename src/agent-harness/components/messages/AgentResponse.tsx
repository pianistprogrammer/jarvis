import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sapColors } from '../../theme';

interface AgentResponseProps {
  text: string;
}

const DIM = sapColors.textDim;

export function AgentResponse({ text }: AgentResponseProps) {
  return (
    <div style={{
      margin: '4px 0 10px',
      padding: '8px 0 10px',
    }}>
      <div style={{
        fontSize: '11px',
        color: DIM,
        marginBottom: '8px',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        assistant
      </div>
      <div style={{ maxWidth: '760px' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 style={styles.h1}>{children}</h1>,
            h2: ({ children }) => <h2 style={styles.h2}>{children}</h2>,
            h3: ({ children }) => <h3 style={styles.h3}>{children}</h3>,
            p: ({ children }) => <p style={styles.p}>{children}</p>,
            ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
            ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
            li: ({ children }) => <li style={styles.li}>{children}</li>,
            strong: ({ children }) => <strong style={styles.strong}>{children}</strong>,
            em: ({ children }) => <em style={styles.em}>{children}</em>,
            hr: () => <hr style={styles.hr} />,
            blockquote: ({ children }) => <blockquote style={styles.blockquote}>{children}</blockquote>,
            a: ({ href, children }) => <a href={href} style={styles.link} target="_blank" rel="noreferrer">{children}</a>,
            table: ({ children }) => <div style={styles.tableWrap}><table style={styles.table}>{children}</table></div>,
            thead: ({ children }) => <thead style={styles.thead}>{children}</thead>,
            th: ({ children }) => <th style={styles.th}>{children}</th>,
            td: ({ children }) => <td style={styles.td}>{children}</td>,
            code: ({ className, children }) => {
              const content = String(children);
              const isBlock = Boolean(className) || content.includes('\n');

              return isBlock
                ? <code style={styles.codeBlockCode}>{children}</code>
                : <code style={styles.inlineCode}>{children}</code>;
            },
            pre: ({ children }) => <pre style={styles.pre}>{children}</pre>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const baseText = {
  fontSize: '13px',
  color: sapColors.text,
  wordBreak: 'break-word' as const,
  lineHeight: '1.7',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, "Cascadia Code", Consolas, monospace',
};

const styles = {
  h1: {
    ...baseText,
    fontSize: '20px',
    margin: '0 0 12px',
    fontWeight: 700,
  },
  h2: {
    ...baseText,
    fontSize: '17px',
    margin: '18px 0 10px',
    fontWeight: 700,
  },
  h3: {
    ...baseText,
    fontSize: '15px',
    margin: '16px 0 8px',
    fontWeight: 700,
  },
  p: {
    ...baseText,
    margin: '0 0 12px',
    whiteSpace: 'pre-wrap' as const,
  },
  ul: {
    ...baseText,
    margin: '0 0 12px',
    paddingLeft: '20px',
  },
  ol: {
    ...baseText,
    margin: '0 0 12px',
    paddingLeft: '20px',
  },
  li: {
    marginBottom: '6px',
  },
  strong: {
    color: sapColors.text,
    fontWeight: 700,
  },
  em: {
    color: sapColors.textMuted,
  },
  hr: {
    border: 0,
    borderTop: `1px solid ${sapColors.borderStrong}`,
    margin: '16px 0',
  },
  blockquote: {
    ...baseText,
    margin: '0 0 12px',
    padding: '0 0 0 12px',
    borderLeft: `3px solid ${sapColors.borderStrong}`,
    color: sapColors.textMuted,
  },
  link: {
    color: sapColors.accentBright,
    textDecoration: 'none',
  },
  tableWrap: {
    overflowX: 'auto' as const,
    margin: '0 0 12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    ...baseText,
  },
  thead: {
    backgroundColor: sapColors.surfaceRaised,
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    border: `1px solid ${sapColors.border}`,
    fontWeight: 700,
  },
  td: {
    padding: '8px 10px',
    border: `1px solid ${sapColors.border}`,
    verticalAlign: 'top' as const,
  },
  inlineCode: {
    backgroundColor: sapColors.appBackground,
    border: `1px solid ${sapColors.border}`,
    borderRadius: '6px',
    padding: '1px 6px',
    color: sapColors.accentBright,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, "Cascadia Code", Consolas, monospace',
    fontSize: '12px',
  },
  pre: {
    margin: '0 0 12px',
    padding: '12px 14px',
    backgroundColor: sapColors.appBackground,
    border: `1px solid ${sapColors.border}`,
    borderRadius: '12px',
    overflowX: 'auto' as const,
  },
  codeBlockCode: {
    color: sapColors.text,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, "Cascadia Code", Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.6',
  },
};
