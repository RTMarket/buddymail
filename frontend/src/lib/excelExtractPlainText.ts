import * as XLSX from "xlsx";

/**
 * 将 Excel 工作簿各表转为制表符分隔的纯文本（用于 TXT/HTML/MD/PDF/Word 导出）。
 * 公式会尽量以计算值呈现；复杂格式与图表不保留。
 */
export async function extractExcelPlainText(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array", cellDates: true });
  if (!wb.SheetNames.length) {
    return "（工作簿中未找到工作表）";
  }

  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: "\t", blankrows: false });
    const normalized = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    parts.push(`【${name}】\n${normalized || "（本表无单元格文本或为空）"}`);
  }
  return parts.join("\n\n");
}
