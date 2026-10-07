import * as XLSX from "xlsx";

export type ExcelListToCsvResult = {
  csvText: string;
  /** 建议下载文件名（原名改后缀 .csv） */
  csvFileName: string;
  sheetName: string;
  /** 含表头的行数（sheet_to_json 行数 + 1，若有表头） */
  rowCountApprox: number;
};

function suggestedCsvName(excelName: string): string {
  const base = industryTagFromImportFileName(excelName) || "excel-list";
  return `${base}.csv`;
}

/** 导入行业标签 = 文件名去掉扩展名（如 `美妆客户.csv` → `美妆客户`） */
export function industryTagFromImportFileName(fileName: string): string {
  const leaf = String(fileName ?? "")
    .replace(/^.*[/\\]/, "")
    .trim();
  return leaf.replace(/\.(csv|xlsx|xls|xlsm)$/i, "").trim();
}

/**
 * 将 Excel 首个工作表转为 UTF-8 CSV 文本（逗号分隔），供 CRM / CSV 导入同一解析链路使用。
 */
export async function convertExcelListFileToCsv(file: File): Promise<ExcelListToCsvResult> {
  const name = file.name.toLowerCase();
  if (!/\.(xlsx|xls|xlsm)$/.test(name)) {
    throw new Error("仅支持 .xlsx / .xls / .xlsm Excel 文件");
  }
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array", cellDates: true, dense: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("工作簿中未找到工作表");
  }
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error("无法读取工作表");
  }
  const csvText = XLSX.utils.sheet_to_csv(ws, { FS: ",", blankrows: false });
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    throw new Error("工作表为空，无法转换为 CSV");
  }
  const rowCountApprox = normalized.split("\n").filter((l) => l.trim().length > 0).length;
  return {
    csvText: normalized.endsWith("\n") ? normalized : `${normalized}\n`,
    csvFileName: suggestedCsvName(file.name),
    sheetName,
    rowCountApprox
  };
}

export function downloadCsvTextFile(csvText: string, fileName: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
