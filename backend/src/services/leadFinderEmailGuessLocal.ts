/** Mirrors plugin emailGuess.js — Western local-part patterns. */
export function guessEmailsFromName(fullName: string, domain: string): string[] {
  const dom = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!dom) return [];
  const clean = (s: string) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .map(clean)
    .filter((p) => p.length >= 1);
  if (!parts.length) return [];
  const first = parts[0]!;
  const last = parts.length >= 2 ? parts[parts.length - 1]! : "";
  const middles = parts.length >= 3 ? parts.slice(1, -1) : [];
  const middle = middles.find((m) => m.length === 1) || middles[0] || "";
  const locals: string[] = [];
  const add = (l: string) => {
    if (l.length >= 2 && l.length <= 64 && !locals.includes(l)) locals.push(l);
  };
  if (first && last) {
    const fi = first[0]!;
    add(`${first}.${last}`);
    add(`${fi}${last}`);
    add(`${first}${last}`);
    add(`${fi}.${last}`);
    add(`${first}_${last}`);
    add(`${last}.${first}`);
    add(`${last}${fi}`);
    add(first);
    if (middle) {
      const mi = middle[0]!;
      add(`${first}.${mi}.${last}`);
      add(`${fi}${mi}${last}`);
      add(`${first}.${middle}.${last}`);
    }
    add(`${first}-${last}`);
  } else if (first) {
    add(first);
  }
  return locals.map((l) => `${l}@${dom}`);
}
