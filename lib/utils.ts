import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Capitalize the first letter of each word in a string */
export function autoCapWords(val: string): string {
  if (!val) return '';
  return val.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** onInput handler for uncontrolled inputs — capitalizes words in-place */
export function onInputCap(e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const input = e.currentTarget;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = autoCapWords(input.value);
  input.setSelectionRange(start, end);
}

/**
 * Gets the current date and time in a specific timezone (defaults to Europe/Brussels)
 */
export function getTZDate(timezone: string = 'Europe/Brussels') {
  // Use Intl.DateTimeFormat to get the parts and reconstruct a date that "looks" like the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(new Date());
  const partValues: Record<string, string> = {};
  parts.forEach(part => {
    partValues[part.type] = part.value;
  });

  // Create a date object that represents the local time in that timezone
  return new Date(
    parseInt(partValues.year),
    parseInt(partValues.month) - 1,
    parseInt(partValues.day),
    parseInt(partValues.hour),
    parseInt(partValues.minute),
    parseInt(partValues.second)
  );
}

/**
 * Gets the weekday name in a specific timezone
 */
export function getTZWeekday(timezone: string = 'Europe/Brussels') {
  return new Intl.DateTimeFormat('en-US', { 
    weekday: 'long', 
    timeZone: timezone 
  }).format(new Date());
}

/**
 * Checks if a store is currently open based on its hours and holidays
 */
export function isStoreOpen(
  storeHours: any[],
  holidays: any[] = [],
  manualIsOpen: boolean = true,
  timezone: string = 'Europe/Brussels'
) {
  if (!manualIsOpen) return false;

  const now = getTZDate(timezone);
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Helper to get weekday name for a given date
  const getWeekdayName = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'long', 
      timeZone: timezone 
    }).format(date);
  };

  const dayName = getWeekdayName(now);

  // Check holidays for the current date in the target timezone
  const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (holidays && Array.isArray(holidays) && holidays.some(h => h.date === dateString)) return false;

  // Check regular hours for "today"
  const todayHours = storeHours.find(h => h.day === dayName);
  if (todayHours && todayHours.isOpen) {
    if (todayHours.is24Hours) return true;

    const [openH, openM] = todayHours.open.split(':').map(Number);
    const [closeH, closeM] = todayHours.close.split(':').map(Number);

    const openTime = openH * 60 + openM;
    let closeTime = closeH * 60 + closeM;

    if (closeTime <= openTime) {
      // Overnight hours: check if we are currently between openTime and midnight
      if (currentTimeInMinutes >= openTime) return true;
    } else {
      // Normal hours: check if we are between open and close
      if (currentTimeInMinutes >= openTime && currentTimeInMinutes < closeTime) return true;
    }
  }

  // Check regular hours for "yesterday" (to handle overnight hours from the previous day)
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayDayName = getWeekdayName(yesterday);
  const yesterdayHours = storeHours.find(h => h.day === yesterdayDayName);

  if (yesterdayHours && yesterdayHours.isOpen) {
    if (yesterdayHours.is24Hours) return true;

    const [openH, openM] = yesterdayHours.open.split(':').map(Number);
    const [closeH, closeM] = yesterdayHours.close.split(':').map(Number);

    const openTime = openH * 60 + openM;
    const closeTime = closeH * 60 + closeM;

    if (closeTime <= openTime) {
      // Overnight hours: if closeTime is 02:00, it means 02:00 AM of "today"
      if (currentTimeInMinutes < closeTime) return true;
    }
  }

  return false;
}
