import { formatAttachmentType } from "./attachments.js";

export function getPrintableAttachmentLabel(attachmentType) {
  return attachmentType && String(attachmentType).trim() ? formatAttachmentType(attachmentType) : "Attachment";
}

export function buildPrintableAttachmentViewModel(attachment) {
  const isImage = Boolean(attachment?.mime_type && String(attachment.mime_type).startsWith("image/"));

  return {
    isImage,
    label: getPrintableAttachmentLabel(attachment?.attachment_type),
    alt: attachment?.original_filename || "Attachment preview",
    placeholderText: "File Preview Not Available"
  };
}
