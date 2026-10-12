import { type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const inputBase = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500';

export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <input className={`${inputBase} ${error ? 'border-red-400' : ''} ${className}`} {...rest} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <textarea rows={3} className={`${inputBase} resize-none ${error ? 'border-red-400' : ''} ${className}`} {...rest} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Select({ label, error, value, onChange, options, placeholder, required, disabled }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={`${inputBase} bg-white ${error ? 'border-red-400' : ''}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
