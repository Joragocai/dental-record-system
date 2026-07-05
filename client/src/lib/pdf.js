import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PDF_MARGIN_MM = 12;
const PDF_FORMAT = "letter";

export async function downloadElementAsPdf(element, filename) {
  if (!element) {
    throw new Error("Printable content is not available.");
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
    onclone(documentClone) {
      documentClone.body.classList.add("pdf-export-mode");
    }
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: PDF_FORMAT
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - PDF_MARGIN_MM * 2;
  const printableHeight = pageHeight - PDF_MARGIN_MM * 2;
  const pageHeightInCanvasPx = Math.floor((canvas.width * printableHeight) / printableWidth);

  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageHeightInCanvasPx, canvas.height - renderedHeight);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const context = pageCanvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare PDF canvas.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const pageImageData = pageCanvas.toDataURL("image/png");
    const renderedPageHeight = (sliceHeight * printableWidth) / canvas.width;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(pageImageData, "PNG", PDF_MARGIN_MM, PDF_MARGIN_MM, printableWidth, renderedPageHeight);
    renderedHeight += sliceHeight;
    pageIndex += 1;
  }

  if (pageIndex === 0) {
    pdf.addPage();
  }

  pdf.save(filename);
}
