import { Document, Packer, Paragraph, TextRun } from "docx";

/** 将纯文本按行导出为 Word .docx（浏览器端生成，不上传服务器） */
export async function plainTextToDocxBlob(plain: string): Promise<Blob> {
  const normalized = plain.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const children = lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line.length > 0 ? line : " " })]
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  return Packer.toBlob(doc);
}
