'use client';

import './report-presence-toggle.css';

type Props = {
  value?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export default function ReportPresenceToggle({ value, onChange, disabled = false, label = '선행기술조사 보고서 유무' }: Props) {
  return <div className="report-presence-toggle" role="group" aria-label={label} aria-disabled={disabled || undefined}>
    <button type="button" className="report-presence-option" aria-pressed={value === true} disabled={disabled}
      onClick={() => { if (!disabled) onChange(true); }}>있음</button>
    <button type="button" className="report-presence-option" aria-pressed={value === false} disabled={disabled}
      onClick={() => { if (!disabled) onChange(false); }}>없음</button>
  </div>;
}
