import type { ChangeEvent } from "react";
import { useTokenCount } from "../../hooks/useTokenCount";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  showTokenCount?: boolean;
  warning?: string;
}

/** A labeled, full-width text input. */
export function TextField({ label, value, onChange, placeholder, warning }: TextFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {warning && <span className="field-warning">⚠ {warning}</span>}
      <input
        className="field-input"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </label>
  );
}

/** A labeled, resizable multi-line text area. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  hint,
  showTokenCount,
  warning,
}: TextFieldProps) {
  const tokenCount = useTokenCount(value, showTokenCount ?? false);
  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">
          {label}
          {hint && <span className="field-hint"> — {hint}</span>}
        </span>
        {showTokenCount && tokenCount !== null && (
          <span className="field-token-count">{tokenCount} Token</span>
        )}
      </span>
      {warning && <span className="field-warning">⚠ {warning}</span>}
      <textarea
        className="field-textarea"
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      />
    </label>
  );
}
