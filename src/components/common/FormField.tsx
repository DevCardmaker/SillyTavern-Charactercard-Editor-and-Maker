import { useId, type ChangeEvent } from "react";
import { useTokenCount } from "../../hooks/useTokenCount";
import { AiTextarea, type AiFieldInfo } from "./AiTextarea";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  showTokenCount?: boolean;
  warning?: string;
  /** AI quick actions above the field (card text fields only). */
  ai?: AiFieldInfo;
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

/** A labeled, resizable multi-line text area. A div rather than a <label> around everything: the
 * quick-action bar has inputs of its own, and a wrapping label would hand clicks on the label text
 * to the first of them. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  hint,
  showTokenCount,
  warning,
  ai,
}: TextFieldProps) {
  const tokenCount = useTokenCount(value, showTokenCount ?? false);
  const id = useId();
  return (
    <div className="field">
      <span className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
          {hint && <span className="field-hint"> — {hint}</span>}
        </label>
        {showTokenCount && tokenCount !== null && (
          <span className="field-token-count">{tokenCount} Token</span>
        )}
      </span>
      {warning && <span className="field-warning">⚠ {warning}</span>}
      <AiTextarea id={id} value={value} onChange={onChange} placeholder={placeholder} rows={rows} ai={ai} />
    </div>
  );
}
