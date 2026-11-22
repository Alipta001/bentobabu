/**
 * Date and Timezone Utilities for BentoBabu
 * All business operations and daily menus use the Asia/Kolkata (IST: UTC+5:30) timezone.
 */

const TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current date string in Asia/Kolkata timezone (YYYY-MM-DD)
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} YYYY-MM-DD
 */
function getKolkataDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid Date passed to getKolkataDateString');
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
}

/**
 * Validates whether a string matches the standard YYYY-MM-DD format
 * @param {string} str
 * @returns {boolean}
 */
function isValidDateString(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Adds or subtracts days from a YYYY-MM-DD string
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days - positive or negative integer
 * @returns {string} YYYY-MM-DD
 */
function addDays(dateStr, days) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + days));
  const resY = utcDate.getUTCFullYear();
  const resM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const resD = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

/**
 * Gets yesterday's date string relative to a given date string (or today)
 * @param {string} [dateStr]
 * @returns {string} YYYY-MM-DD
 */
function getYesterday(dateStr = getKolkataDateString()) {
  return addDays(dateStr, -1);
}

/**
 * Gets tomorrow's date string relative to a given date string (or today)
 * @param {string} [dateStr]
 * @returns {string} YYYY-MM-DD
 */
function getTomorrow(dateStr = getKolkataDateString()) {
  return addDays(dateStr, 1);
}

/**
 * Returns Monday of the week containing dateStr (Monday to Sunday week)
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD (Monday)
 */
function getMondayOfWeek(dateStr = getKolkataDateString()) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
  const day = utcDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diffToMonday);
}

/**
 * Returns an array of 7 date strings (YYYY-MM-DD) starting from startDateStr
 * @param {string} startDateStr - YYYY-MM-DD
 * @returns {string[]}
 */
function getWeekDates(startDateStr) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(startDateStr, i));
  }
  return dates;
}

/**
 * Returns the day of week index (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * for a YYYY-MM-DD string in Asia/Kolkata timezone.
 * @param {string} [dateStr] - YYYY-MM-DD
 * @returns {number} 0-6
 */
function getDayOfWeek(dateStr = getKolkataDateString()) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return utcDate.getUTCDay();
}

/**
 * Returns the English weekday name for a day index (0 = Sunday ... 6 = Saturday)
 * @param {number} dayIndex
 * @returns {string}
 */
function getDayName(dayIndex) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const idx = Number(dayIndex);
  if (isNaN(idx) || idx < 0 || idx > 6) {
    throw new Error(`Invalid day index: ${dayIndex}`);
  }
  return names[idx];
}

/**
 * Returns the current time in Asia/Kolkata timezone as "HH:mm" (24-hour format)
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} HH:mm
 */
function getKolkataTimeString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid Date passed to getKolkataTimeString');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

module.exports = {
  TIMEZONE,
  getKolkataDateString,
  getKolkataTimeString,
  isValidDateString,
  addDays,
  getYesterday,
  getTomorrow,
  getMondayOfWeek,
  getWeekDates,
  getDayOfWeek,
  getDayName,
};
