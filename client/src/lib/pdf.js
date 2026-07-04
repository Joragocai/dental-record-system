import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function downloadElementAsPdf(element, filename) {
  if (!element) {
    throw new Error("Printable content is not available.");
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false
  });

  const imageData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let remainingHeight = imageHeight;
  let offsetY = 0;

  pdf.addImage(imageData, "PNG", margin, offsetY + margin, imageWidth, imageHeight);
  remainingHeight -= pageHeight - margin * 2;

  while (remainingHeight > 0) {
    offsetY = remainingHeight - imageHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", margin, offsetY + margin, imageWidth, imageHeight);
    remainingHeight -= pageHeight - margin * 2;
  }

  pdf.save(filename);
}
