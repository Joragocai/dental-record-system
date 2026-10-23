export const demoAttachmentTemplates = {
  txt: {
    extension: ".txt",
    mimeType: "text/plain",
    buildBuffer(seed) {
      return Buffer.from(
        [
          "DEMO ONLY",
          "FICTIONAL RECORD",
          "NOT FOR CLINICAL USE",
          "",
          `Attachment: ${seed.attachmentType}`,
          `Owner Type: ${seed.ownerType}`,
          `Owner Key: ${seed.ownerKey}`,
          "",
          "This file is generated only for system testing and client presentation."
        ].join("\n"),
        "utf8"
      );
    }
  },
  pdf: {
    extension: ".pdf",
    mimeType: "application/pdf",
    buildBuffer(seed) {
      const content = `BT /F1 18 Tf 36 760 Td (DEMO ONLY) Tj 0 -24 Td (FICTIONAL RECORD) Tj 0 -24 Td (NOT FOR CLINICAL USE) Tj 0 -36 Td (${seed.attachmentType}) Tj ET`;
      const pdf = `%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f${" "}
0000000010 00000 n${" "}
0000000063 00000 n${" "}
0000000122 00000 n${" "}
0000000271 00000 n${" "}
0000000464 00000 n${" "}
trailer << /Size 6 /Root 1 0 R >>
startxref
534
%%EOF`;
      return Buffer.from(pdf, "utf8");
    }
  },
  png: {
    extension: ".png",
    mimeType: "image/png",
    buildBuffer() {
      return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z4FoAAAAASUVORK5CYII=",
        "base64"
      );
    }
  }
};
