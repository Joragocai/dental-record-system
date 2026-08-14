import { formatAttachmentType } from "./attachments.js";

interface PrintableAttachmentLike {
  attachment_type?: string | null;
  mime_type?: string | null;
  original_filename?: string | null;
}

interface PrintableAttachmentViewModel {
  isImage: boolean;
  label: string;
  alt: string;
  placeholderText: string;
}

export function getPrintableAttachmentLabel(attachmentType: string | null | undefined): string {
  return attachmentType && String(attachmentType).trim() ? formatAttachmentType(attachmentType) : "Attachment";
}

export function buildPrintableAttachmentViewModel(
  attachment: PrintableAttachmentLike | null | undefined
): PrintableAttachmentViewModel {
  const isImage = Boolean(attachment?.mime_type && String(attachment.mime_type).startsWith("image/"));

  return {
    isImage,
    label: getPrintableAttachmentLabel(attachment?.attachment_type),
    alt: attachment?.original_filename || "Attachment preview",
    placeholderText: "File Preview Not Available"
  };
}
