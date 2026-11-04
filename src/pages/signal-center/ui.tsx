import React from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export type Tone = 'good' | 'bad' | 'warn' | 'info';

export const Card = ({ title, hint, on, children }: { title?: string; hint?: string; on?: boolean; children: React.ReactNode }) => (
  <section className={cx('pps-sig-card', on && 'pps-sig-card--on')}>
    {title && (
      <header className='pps-sig-card__head'>
        <h3 className='pps-sig-card__title'>{title}</h3>
        {hint && <span className='pps-sig-card__hint'>{hint}</span>}
      </header>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: Tone }) => (
  <div className='pps-sig-stat'>
    <span className='pps-sig-stat__label'>{label}</span>
    <span className={cx('pps-sig-stat__value', tone && `is-${tone}`)}>{value}</span>
  </div>
);

/** Number box that keeps what you type (even while the page refreshes) and saves valid numbers as you go. */
export const NumInput = ({ value, onCommit }: { value: number; onCommit: (v: number) => void }) => {
  const [text, setText] = React.useState(String(value));
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => { if (!focus) setText(String(value)); }, [value, focus]);
  return (
    <input
      className='pps-sig-input' type='text' inputMode='decimal' value={text}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => {
        const t = e.target.value;
        if (/^\d*\.?\d*$/.test(t)) { setText(t); const v = parseFloat(t); if (!Number.isNaN(v)) onCommit(v); }
      }}
    />
  );
};

export const Field = ({ label, value, onCommit, hint }: { label: string; value: number; onCommit: (v: number) => void; hint?: string }) => (
  <label className='pps-sig-field'>
    <span className='pps-sig-field__label'>{label}</span>
    <NumInput value={value} onCommit={onCommit} />
    {hint && <span className='pps-sig-field__hint'>{hint}</span>}
  </label>
);

export const SelectField = ({ label, value, onChange, options }: {
  label: string; value: string | number; onChange: (v: string) => void; options: [string | number, string][];
}) => (
  <label className='pps-sig-field'>
    <span className='pps-sig-field__label'>{label}</span>
    <select className='pps-sig-input' value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  </label>
);

export const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className='pps-sig-check'>
    <input type='checkbox' checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

export const Row = ({ left, right, tone }: { left: React.ReactNode; right: React.ReactNode; tone?: Tone }) => (
  <div className={cx('pps-sig-row', tone && `is-${tone}`)}>
    <span>{left}</span>
    <span>{right}</span>
  </div>
);
