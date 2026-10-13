import type { ProtocolName } from '@fsms/scenarios';

interface Props {
  value: ProtocolName;
  onChange: (protocol: ProtocolName) => void;
}

const options: ProtocolName[] = ['UDP', 'TCP'];

export function ProtocolSelector({ value, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Protocolo">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'segment active' : 'segment'}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}