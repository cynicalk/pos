import { createContext, useContext, useState, useCallback } from 'react';
import settingsOptions from '@shared/settings-options.json';

const TIMEZONES = settingsOptions.timezones;

const TimezoneContext = createContext(null);

export function TimezoneProvider({ children }) {
  const [iana, setIana] = useState(
    () => localStorage.getItem('pos_timezone') || 'UTC',
  );

  const timezone = TIMEZONES.find((t) => t.iana === iana) || TIMEZONES[0];

  const setTimezone = useCallback((newIana) => {
    localStorage.setItem('pos_timezone', newIana);
    setIana(newIana);
  }, []);

  // Format a Date object as HH:MM in the selected timezone
  const formatTime = useCallback(
    (date) =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: iana,
      }).format(date),
    [iana],
  );

  // Get today's date string (YYYY-MM-DD) in the selected timezone
  const todayLocal = useCallback(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: iana }).format(new Date()),
    [iana],
  );

  return (
    <TimezoneContext.Provider
      value={{ iana, timezone, timezones: TIMEZONES, setTimezone, formatTime, todayLocal }}
    >
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}
