// Controlled draft only: the Settings confirmation button owns validation and persistence.
export function TripRateInput({
  value,
  onChange,
  readOnly = false,
  invalid = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0.01"
      max="1000000"
      step="any"
      value={value}
      readOnly={readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      placeholder="確認後取得最新匯率"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
