/** 最小 RFC4180 风格解析（支持引号与转义引号） */
export function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

/** 根据首行判断：部分 Excel（尤其欧洲区域）另存为 CSV 时使用分号分隔 */
export function detectCsvDelimiter(text: string): "," | ";" {
  const s = stripBom(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const first = s.split("\n").find((l) => l.trim().length > 0) ?? "";
  const commas = (first.match(/,/g) ?? []).length;
  const semicolons = (first.match(/;/g) ?? []).length;
  if (semicolons > commas) return ";";
  return ",";
}

export function parseCsv(text: string, delimiter: "," | ";" = ","): string[][] {
  const s = stripBom(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}
