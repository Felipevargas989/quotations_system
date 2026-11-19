/** «19-11-2026» desde una fecha ISO (o aaaa-mm-dd), en hora de Chile. */
export const fechaCl = (f: string | null | undefined): string => {
  if (!f) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const [a, m, d] = f.split("-");
    return `${d}-${m}-${a}`;
  }
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(f));
  const de = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${de("day")}-${de("month")}-${de("year")}`;
};
