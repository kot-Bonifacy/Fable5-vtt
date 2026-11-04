/**
 * Przełącznik kilku wartości w jednym rzędzie (rola `radiogroup`) z Edycji
 * sceny (15.10) — wydzielony 03.11, bo te same pola stawia kreator pościgu.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; hint: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="scene-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={`scene-seg-option${option.id === value ? ' is-active' : ''}`}
          title={option.hint}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
