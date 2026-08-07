// ==============================================================================
// COMPOSANT REACT : MASQUE DE SAISIE MONÉTAIRE (SANS UNITÉ Ar) - RESPONSIVE
// ==============================================================================
import React, { useEffect, useState } from 'react';

interface MonetaryInputProps {
  value: number | string | undefined;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * Formate un nombre avec des espaces comme séparateur de milliers.
 * Ex: 700000 -> "700 000"
 */
export function formatSpace(num: number | string | undefined): string {
  if (num === undefined || num === null || num === '') return '0';
  const digits = String(num).replace(/\D/g, '');
  if (!digits) return '0';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Format standard sans unité (remplace ancien formatAr avec Ar)
 */
export function formatNumber(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const MonetaryInput: React.FC<MonetaryInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = '0',
  required = false,
  id
}) => {
  const [displayValue, setDisplayValue] = useState<string>(formatSpace(value || 0));

  useEffect(() => {
    setDisplayValue(formatSpace(value || 0));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const num = raw ? parseInt(raw, 10) : 0;
    setDisplayValue(formatSpace(raw));
    onChange(num);
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={displayValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        required={required}
        className={`${className} font-mono font-bold text-right`}
      />
    </div>
  );
};
