import React, { useState } from 'react';
import { resolvePrompt, type PromptData } from '../studioActions/uiActions';

export function AgentPromptCard({ promptData }: { promptData: PromptData }) {
  const [textValue, setTextValue] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const responded = !!promptData.response;

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: `1px solid ${responded ? 'var(--border-color, #45475a)' : 'var(--accent-color, #89b4fa)'}`,
    borderRadius: 8,
    padding: '12px 16px',
    maxWidth: 520,
    margin: '8px 0',
    opacity: responded ? 0.85 : 1,
  };

  const msgStyle: React.CSSProperties = {
    marginBottom: responded ? 6 : 10,
    fontSize: 14,
    color: 'var(--text-primary, #cdd6f4)',
    lineHeight: 1.5,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted, #6c7086)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 4,
  };

  const btnBase: React.CSSProperties = {
    padding: '6px 16px',
    borderRadius: 6,
    border: '1px solid var(--border-color, #45475a)',
    background: 'var(--bg-tertiary, #313244)',
    color: 'var(--text-primary, #cdd6f4)',
    cursor: responded ? 'default' : 'pointer',
    fontSize: 13,
    transition: 'background 0.15s, border-color 0.15s',
  };

  const btnSelected: React.CSSProperties = {
    ...btnBase,
    background: 'var(--accent-color, #89b4fa)',
    color: 'var(--bg-primary, #1e1e2e)',
    border: '1px solid var(--accent-color, #89b4fa)',
    fontWeight: 600,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: 'var(--accent-color, #89b4fa)',
    color: 'var(--bg-primary, #1e1e2e)',
    border: 'none',
    fontWeight: 600,
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-color, #45475a)',
    background: 'var(--bg-primary, #11111b)',
    color: 'var(--text-primary, #cdd6f4)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  };

  if (promptData.prompt_type === 'choices') {
    const options: string[] = Array.isArray(promptData.options) ? promptData.options : [];
    const selectedChoice = promptData.response?.choice;

    return (
      <div style={cardStyle}>
        <div style={labelStyle}>Agent is asking</div>
        <div style={msgStyle}>{promptData.message}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((opt, i) => {
            const isSelected = responded && selectedChoice === opt;
            const isOther = responded && !isSelected;
            return (
              <button
                key={i}
                style={{
                  ...(isSelected ? btnSelected : btnBase),
                  ...(isOther ? { opacity: 0.4 } : {}),
                }}
                disabled={responded}
                onClick={() => !responded && resolvePrompt(promptData.id, { choice: opt, index: i })}
              >
                {isSelected && '\u2713 '}{opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (promptData.prompt_type === 'confirm') {
    const confirmed = promptData.response?.confirmed;
    return (
      <div style={cardStyle}>
        <div style={labelStyle}>Agent is asking</div>
        <div style={msgStyle}>{promptData.message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{
              ...(responded && confirmed ? btnSelected : btnPrimary),
              ...(responded && !confirmed ? { opacity: 0.4 } : {}),
            }}
            disabled={responded}
            onClick={() => !responded && resolvePrompt(promptData.id, { confirmed: true })}
          >
            {responded && confirmed && '\u2713 '}Yes
          </button>
          <button
            style={{
              ...(responded && !confirmed ? btnSelected : btnBase),
              ...(responded && confirmed ? { opacity: 0.4 } : {}),
            }}
            disabled={responded}
            onClick={() => !responded && resolvePrompt(promptData.id, { confirmed: false })}
          >
            {responded && !confirmed && '\u2713 '}No
          </button>
        </div>
      </div>
    );
  }

  if (promptData.prompt_type === 'text') {
    const respondedText = promptData.response?.text;
    return (
      <div style={cardStyle}>
        <div style={labelStyle}>Agent is asking</div>
        <div style={msgStyle}>{promptData.message}</div>
        {responded ? (
          <div style={{
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--bg-primary, #11111b)',
            color: 'var(--text-primary, #cdd6f4)',
            fontSize: 13,
            border: '1px solid var(--accent-color, #89b4fa)',
          }}>
            {respondedText}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textValue.trim()) {
                  resolvePrompt(promptData.id, { text: textValue.trim() });
                }
              }}
              placeholder="Type your response..."
              style={{ ...inputStyle, flex: 1 }}
              autoFocus
            />
            <button
              style={btnPrimary}
              onClick={() => textValue.trim() && resolvePrompt(promptData.id, { text: textValue.trim() })}
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  }

  if (promptData.prompt_type === 'form') {
    const fields: Array<{ name: string; label?: string; type?: string; placeholder?: string }> =
      Array.isArray(promptData.options) ? promptData.options : (promptData.options?.fields || []);
    const respondedFields = promptData.response?.fields;

    return (
      <div style={cardStyle}>
        <div style={labelStyle}>Agent is asking</div>
        <div style={msgStyle}>{promptData.message}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map((field) => (
            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #a6adc8)' }}>
                {field.label || field.name}
              </label>
              {responded ? (
                <div style={{
                  ...inputStyle,
                  border: '1px solid var(--accent-color, #89b4fa)',
                  background: 'var(--bg-primary, #11111b)',
                }}>
                  {respondedFields?.[field.name] || ''}
                </div>
              ) : (
                <input
                  type={field.type || 'text'}
                  value={formValues[field.name] || ''}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  placeholder={field.placeholder || ''}
                  style={inputStyle}
                />
              )}
            </div>
          ))}
          {!responded && (
            <button
              style={{ ...btnPrimary, alignSelf: 'flex-end', marginTop: 4 }}
              onClick={() => resolvePrompt(promptData.id, { fields: formValues })}
            >
              Submit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>Agent prompt</div>
      <div style={msgStyle}>{promptData.message}</div>
      {!responded && (
        <button style={btnBase} onClick={() => resolvePrompt(promptData.id, { dismissed: true })}>
          OK
        </button>
      )}
      {responded && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6c7086)' }}>
          Responded
        </div>
      )}
    </div>
  );
}

export default AgentPromptCard;
