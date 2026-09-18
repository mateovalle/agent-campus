import { useState } from 'react';

import { CHAT_BODY_FONT_SIZE_PX, CHAT_CODE_FONT_SIZE_PX } from '../../constants.js';
import type { AskQuestion, ToolCallStatus } from './chatModel.js';
import { parseAskAnswers } from './chatModel.js';
import type { PermissionRequestInfo } from './PermissionCard.js';

/**
 * Inline card for AskUserQuestion tool calls — rendered in the message list
 * in place of the generic ToolCard.
 *
 * AskUserQuestion has no executor of its own: the host must collect the
 * user's answers and return them via `updatedInput.answers` on allow. While
 * the matching permission request is pending, the card is interactive
 * (pixel-style option buttons + free-text "Other"); once resolved it renders
 * a compact question→answer record parsed from the tool result.
 *
 * Single question + single-select answers immediately on click (the common
 * fast path); multi-select or multi-question shows an explicit Answer button.
 */

interface QuestionCardProps {
  questions: AskQuestion[];
  /** Tool call status from the chat item ('running' while unanswered). */
  status: ToolCallStatus;
  resultSummary: string | null;
  /** Pending permission request — its presence makes the card interactive. */
  request?: PermissionRequestInfo;
  onRespond?: (
    requestId: string,
    allow: boolean,
    message?: string,
    updatedInput?: Record<string, unknown>,
  ) => void;
}

const DISMISS_MESSAGE = 'The user dismissed the question. Proceed with your best judgment.';

// ── Styles ───────────────────────────────────────────────────

const cardBaseStyle: React.CSSProperties = {
  borderRadius: 0,
  margin: '4px 0',
  background: 'var(--pixel-chat-card-bg)',
};

const cardActiveStyle: React.CSSProperties = {
  ...cardBaseStyle,
  border: '2px solid var(--pixel-accent)',
  boxShadow: 'var(--pixel-shadow)',
  background: 'var(--pixel-chat-permission-bg)',
};

const cardSettledStyle: React.CSSProperties = {
  ...cardBaseStyle,
  border: '2px solid var(--pixel-border)',
};

const titleBarBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 8px',
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  userSelect: 'none',
};

const titleBarActiveStyle: React.CSSProperties = {
  ...titleBarBaseStyle,
  background: 'var(--pixel-accent)',
  color: 'var(--pixel-bg)',
};

const titleBarSettledStyle: React.CSSProperties = {
  ...titleBarBaseStyle,
  borderBottom: '1px solid var(--pixel-border)',
  color: 'var(--pixel-text-dim)',
};

const titleGlyphStyle: React.CSSProperties = {
  fontWeight: 700,
};

const dismissXStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  color: 'var(--pixel-bg)',
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  fontWeight: 700,
  padding: '0 2px',
  letterSpacing: 1,
  textTransform: 'uppercase',
  opacity: 0.75,
};

const bodyStyle: React.CSSProperties = {
  padding: '6px 10px 10px',
};

const headerChipStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  fontWeight: 700,
  color: 'var(--pixel-accent)',
  border: '1px solid var(--pixel-accent)',
  padding: '0 5px',
  marginRight: 6,
  verticalAlign: 'middle',
};

const questionTextStyle: React.CSSProperties = {
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  fontWeight: 700,
  color: 'var(--pixel-text)',
};

const optionBtnBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '5px 8px',
  marginTop: 6,
  borderRadius: 0,
  cursor: 'pointer',
  background: 'var(--pixel-chat-code-bg)',
  border: '2px solid var(--pixel-border)',
  color: 'var(--pixel-text)',
  fontFamily: 'inherit',
};

const optionBtnHoverStyle: React.CSSProperties = {
  ...optionBtnBaseStyle,
  border: '2px solid var(--pixel-accent)',
  background: 'var(--pixel-btn-hover-bg)',
};

const optionBtnSelectedStyle: React.CSSProperties = {
  ...optionBtnBaseStyle,
  border: '2px solid var(--pixel-accent)',
  background: 'var(--pixel-active-bg)',
};

const optionMarkerStyle = (selected: boolean): React.CSSProperties => ({
  width: 10,
  height: 10,
  flexShrink: 0,
  marginTop: 5,
  border: `2px solid ${selected ? 'var(--pixel-accent)' : 'var(--pixel-border)'}`,
  background: selected ? 'var(--pixel-accent)' : 'transparent',
});

const optionLabelStyle: React.CSSProperties = {
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  fontWeight: 700,
  lineHeight: 1.3,
};

const optionDescStyle: React.CSSProperties = {
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  marginTop: 1,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontWeight: 400,
};

const otherRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 6,
};

const otherInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  fontFamily: 'inherit',
  background: 'var(--pixel-chat-code-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 8px',
  outline: 'none',
};

const footerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
};

const answerBtnStyle: React.CSSProperties = {
  padding: '3px 14px',
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  fontWeight: 700,
  fontFamily: 'inherit',
  borderRadius: 0,
  cursor: 'pointer',
  background: 'var(--pixel-accent)',
  border: '2px solid var(--pixel-accent)',
  color: 'var(--pixel-bg)',
};

const answerBtnDisabledStyle: React.CSSProperties = {
  ...answerBtnStyle,
  opacity: 0.4,
  cursor: 'default',
};

const hintStyle: React.CSSProperties = {
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
};

const answeredLineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginTop: 3,
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  color: 'var(--pixel-chat-green)',
  wordBreak: 'break-word',
};

const settledSummaryStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// ── Settled (answered / dismissed / waiting) view ────────────

function SettledView({
  questions,
  status,
  resultSummary,
}: {
  questions: AskQuestion[];
  status: ToolCallStatus;
  resultSummary: string | null;
}) {
  const answers = status === 'done' ? parseAskAnswers(resultSummary) : new Map<string, string>();
  const showRawFallback = status === 'done' && answers.size === 0 && resultSummary !== null;

  return (
    <div style={cardSettledStyle} className="pixel-chat-body">
      <div style={titleBarSettledStyle}>
        <span style={{ ...titleGlyphStyle, color: 'var(--pixel-accent)' }}>?</span>
        <span>Question</span>
        {status === 'done' && (
          <span style={{ color: 'var(--pixel-chat-green)' }}>· answered ✓</span>
        )}
        {status === 'error' && (
          <span style={{ color: 'var(--pixel-chat-red)' }}>· dismissed ✗</span>
        )}
        {status === 'running' && (
          <span className="pixel-chat-dot" style={{ color: 'var(--pixel-chat-amber)' }}>
            · waiting…
          </span>
        )}
      </div>
      <div style={bodyStyle}>
        {questions.map((q, qi) => {
          const answer = answers.get(q.question);
          return (
            <div key={qi} style={{ marginTop: qi === 0 ? 0 : 8 }}>
              <div
                style={{ ...questionTextStyle, ...(status === 'error' ? { opacity: 0.6 } : {}) }}
              >
                {q.header && <span style={headerChipStyle}>{q.header}</span>}
                {q.question}
              </div>
              {answer !== undefined && (
                <div style={answeredLineStyle}>
                  <span style={{ flexShrink: 0 }}>▸</span>
                  <span>{answer}</span>
                </div>
              )}
            </div>
          );
        })}
        {showRawFallback && <div style={settledSummaryStyle}>{resultSummary}</div>}
      </div>
    </div>
  );
}

// ── Interactive view ─────────────────────────────────────────

function InteractiveView({
  questions,
  request,
  onRespond,
}: {
  questions: AskQuestion[];
  request: PermissionRequestInfo;
  onRespond: NonNullable<QuestionCardProps['onRespond']>;
}) {
  // Per-question selected labels + free-text "Other" answer
  const [selected, setSelected] = useState<Set<string>[]>(() =>
    questions.map(() => new Set<string>()),
  );
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''));
  const [hovered, setHovered] = useState<string | null>(null);

  // Single question, single choice → answer immediately on click
  const instant = questions.length === 1 && questions[0].multiSelect !== true;

  const answersFrom = (sel: Set<string>[], otherTexts: string[]): Record<string, string> => {
    const answers: Record<string, string> = {};
    questions.forEach((q, qi) => {
      const parts = q.options.map((o) => o.label).filter((label) => sel[qi].has(label));
      const otherText = otherTexts[qi].trim();
      if (otherText !== '') parts.push(otherText);
      answers[q.question] = parts.join(', ');
    });
    return answers;
  };

  const submitWith = (sel: Set<string>[], otherTexts: string[]) => {
    onRespond(request.requestId, true, undefined, {
      ...request.input,
      answers: answersFrom(sel, otherTexts),
    });
  };

  const answerFor = (qi: number): string => {
    const parts = questions[qi].options
      .map((o) => o.label)
      .filter((label) => selected[qi].has(label));
    const otherText = other[qi].trim();
    if (otherText !== '') parts.push(otherText);
    return parts.join(', ');
  };

  const allAnswered = questions.every((_, qi) => answerFor(qi) !== '');

  const toggleOption = (qi: number, label: string, multiSelect: boolean) => {
    if (instant) {
      // Fast path: clicking the option IS the answer
      const sel = questions.map(() => new Set<string>());
      sel[qi].add(label);
      submitWith(
        sel,
        questions.map(() => ''),
      );
      return;
    }
    setSelected((prev) => {
      const next = prev.map((s, i) => (i === qi ? new Set(s) : s));
      const set = next[qi];
      if (multiSelect) {
        if (set.has(label)) set.delete(label);
        else set.add(label);
      } else {
        const wasSelected = set.has(label);
        set.clear();
        if (!wasSelected) set.add(label);
      }
      return next;
    });
    if (!multiSelect) {
      setOther((prev) => prev.map((t, i) => (i === qi ? '' : t)));
    }
  };

  const setOtherText = (qi: number, text: string) => {
    setOther((prev) => prev.map((t, i) => (i === qi ? text : t)));
    if (text.trim() !== '' && questions[qi].multiSelect !== true) {
      // Free text replaces the option selection for single-select questions
      setSelected((prev) => prev.map((s, i) => (i === qi ? new Set<string>() : s)));
    }
  };

  const submit = () => {
    if (!allAnswered) return;
    submitWith(selected, other);
  };

  const dismiss = () => onRespond(request.requestId, false, DISMISS_MESSAGE);

  return (
    <div style={cardActiveStyle} className="pixel-chat-body">
      <div style={titleBarActiveStyle}>
        <span className="pixel-chat-dot" style={titleGlyphStyle}>
          ?
        </span>
        <span>Claude asks</span>
        <button
          style={dismissXStyle}
          onClick={dismiss}
          title="Dismiss — Claude proceeds on its own"
        >
          skip ✗
        </button>
      </div>
      <div style={bodyStyle}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ marginTop: qi === 0 ? 0 : 12 }}>
            <div style={questionTextStyle}>
              {q.header && <span style={headerChipStyle}>{q.header}</span>}
              {q.question}
            </div>
            {q.options.map((option) => {
              const optionKey = `${qi}:${option.label}`;
              const isSelected = selected[qi].has(option.label);
              const style = isSelected
                ? optionBtnSelectedStyle
                : hovered === optionKey
                  ? optionBtnHoverStyle
                  : optionBtnBaseStyle;
              return (
                <button
                  key={option.label}
                  style={style}
                  onClick={() => toggleOption(qi, option.label, q.multiSelect === true)}
                  onMouseEnter={() => setHovered(optionKey)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span style={optionMarkerStyle(isSelected)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={optionLabelStyle}>{option.label}</span>
                    {option.description && <div style={optionDescStyle}>{option.description}</div>}
                  </span>
                </button>
              );
            })}
            <div style={otherRowStyle}>
              <span style={{ ...hintStyle, flexShrink: 0 }}>↳</span>
              <input
                style={otherInputStyle}
                value={other[qi]}
                onChange={(e) => setOtherText(qi, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (instant && other[qi].trim() !== '') {
                      submitWith(
                        questions.map(() => new Set<string>()),
                        other,
                      );
                    } else if (allAnswered) {
                      submit();
                    }
                  }
                }}
                placeholder="Type your own answer… (Enter sends)"
              />
            </div>
          </div>
        ))}
        <div style={footerRowStyle}>
          {instant ? (
            <span style={hintStyle}>click an option to answer</span>
          ) : (
            <>
              <button
                style={allAnswered ? answerBtnStyle : answerBtnDisabledStyle}
                disabled={!allAnswered}
                onClick={submit}
              >
                Answer ▸
              </button>
              {!allAnswered && <span style={hintStyle}>answer every question to send</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuestionCard({
  questions,
  status,
  resultSummary,
  request,
  onRespond,
}: QuestionCardProps) {
  if (status === 'running' && request && onRespond) {
    // Remount per request so selections reset if the SDK re-asks
    return (
      <InteractiveView
        key={request.requestId}
        questions={questions}
        request={request}
        onRespond={onRespond}
      />
    );
  }
  return <SettledView questions={questions} status={status} resultSummary={resultSummary} />;
}
