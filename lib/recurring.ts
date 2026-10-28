export function addFrequency(dateStr: string | null, freq: string): string {
  // Validate: null atau invalid date string
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // Fallback ke today
    const today = new Date();
    dateStr = today.toISOString().slice(0, 10);
  }
  
  const d = new Date(dateStr + "T00:00:00");
  
  // Double-check: isValid
  if (Number.isNaN(d.getTime())) {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  }
  
  if (freq === "daily") d.setDate(d.getDate() + 1);
  else if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  
  return d.toISOString().slice(0, 10);
}
