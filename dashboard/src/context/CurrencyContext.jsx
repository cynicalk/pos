import { createContext, useContext, useState, useCallback } from 'react';
import settingsOptions from '@shared/settings-options.json';
import { formatMoney, formatMoneyOrDash } from '@shared/format-money';

const CURRENCIES = Object.fromEntries(settingsOptions.currencies.map((c) => [c.code, c]));

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [code, setCode] = useState(
    () => localStorage.getItem('pos_currency') || 'USD',
  );

  const currency = CURRENCIES[code] || CURRENCIES.USD;

  // Both come from shared/format-money.js so the screen, the printed receipt
  // and the guest menu app cannot drift apart on how a number looks.
  const format = useCallback((amount) => formatMoney(amount, currency), [currency]);

  // For a figure the system could not establish. `format` still renders a
  // missing value as zero, which is right on a bill line and wrong on an
  // opportunity nobody could price.
  const formatOrDash = useCallback((amount) => formatMoneyOrDash(amount, currency), [currency]);

  const setCurrency = useCallback((newCode) => {
    localStorage.setItem('pos_currency', newCode);
    setCode(newCode);
  }, []);

  return (
    <CurrencyContext.Provider
      value={{ code, currency, format, formatOrDash, setCurrency, currencies: CURRENCIES }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
