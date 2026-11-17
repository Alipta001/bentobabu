export function getKolkataToday(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const resY = date.getUTCFullYear();
  const resM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const resD = String(date.getUTCDate()).padStart(2, "0");
  return `${resY}-${resM}-${resD}`;
}

export function getMondayOfWeek(dateStr: string = getKolkataToday()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diffToMonday);
}

export function getWeekDates(startDateStr: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(startDateStr, i));
  }
  return dates;
}

export function formatDateLabel(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}
