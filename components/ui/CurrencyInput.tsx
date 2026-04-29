'use client';

import React, { useState, useEffect, useRef } from 'react';

/**
 * A POS/ATM style currency input.
 * User types numbers, string formats from right-to-left decimal.
 */
export default function CurrencyInput({
  defaultValue = 0,
  onChange,
  id,
  name,
  required,
  className,
  placeholder = '0,00',
  allowNegative = false
}: {
  defaultValue?: number;
  onChange?: (val: number) => void;
  id?: string;
  name?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  allowNegative?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with the formatted string (e.g., 2.5 -> "2,50")
  const [strValue, setStrValue] = useState(
    defaultValue !== undefined && defaultValue !== 0 
      ? defaultValue.toFixed(2).replace('.', ',') 
      : ''
  );

  useEffect(() => {
    // Only remote-sync if defaultValue changes externally
    if (defaultValue === undefined) return;
    
    // Check if the new defaultValue differs from our current parsed string
    const rawDigits = strValue.replace(/[^\d]/g, '');
    const isNegative = strValue.includes('-');
    const currentNum = (rawDigits ? parseInt(rawDigits, 10) / 100 : 0) * (isNegative ? -1 : 1);
    
    if (currentNum !== defaultValue) {
      const isDefNeg = defaultValue < 0;
      const absVal = Math.abs(defaultValue);
      setStrValue(defaultValue === 0 ? '' : (isDefNeg ? '-' : '') + absVal.toFixed(2).replace('.', ','));
    }
  }, [defaultValue]); // Intentionally omitting strValue to allow typing without continuous overwrites

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const isNegative = allowNegative && raw.includes('-');
    
    // Extract only the digits from the input
    const digitsOnly = raw.replace(/[^\d]/g, '');
    
    if (!digitsOnly) {
      setStrValue(isNegative ? '-' : '');
      if (onChange) onChange(0);
      return;
    }

    // Convert digits to an integer, then divide by 100
    const valCents = parseInt(digitsOnly, 10);
    const absFloatVal = valCents / 100;
    const floatVal = absFloatVal * (isNegative ? -1 : 1);
    
    // Format the result to always have 2 decimal places and a comma
    const formatted = (isNegative ? '-' : '') + absFloatVal.toFixed(2).replace('.', ',');
    
    setStrValue(formatted);

    if (onChange) {
      onChange(floatVal);
    }
  };

  const handleFocus = (e: any) => {
    // ATM inputs work best when cursor is forced to the extreme right
    const len = e.target.value.length;
    setTimeout(() => {
      e.target.setSelectionRange(len, len);
    }, 0);
  };

  // Prevent cursor from moving with arrow keys, preserving ATM experience
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
    if (e.key === '-' && allowNegative) {
      // Allow minus key to be handled normally or we can just let it through and it will be parsed
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span className="text-slate-400 sm:text-sm">€</span>
      </div>
      <input
        ref={inputRef}
        type="text" // using text to prevent browser mobile keyboards from fighting our format
        inputMode="numeric" // Forces numeric keypad on iOS/Android
        id={id}
        name={name}
        required={required}
        placeholder={placeholder}
        className={`${className} pl-8`}
        value={strValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onClick={handleFocus}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
