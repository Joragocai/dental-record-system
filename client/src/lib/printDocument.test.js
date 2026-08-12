import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintableAttachmentViewModel, getPrintableAttachmentLabel } from "./printDocument.js";

test("printable attachment labels preserve attachment categories and fallback label", () => {
  assert.equal(getPrintableAttachmentLabel("X-ray"), "X-ray");
  assert.equal(getPrintableAttachmentLabel(""), "Attachment");
  assert.equal(getPrintableAttachmentLabel(null), "Attachment");
});

test("printable attachment view model keeps image previews image-only", () => {
  assert.deepEqual(
    buildPrintableAttachmentViewModel({
      attachment_type: "Profile Photo",
      mime_type: "image/jpeg",
      original_filename: "patient-photo.jpg"
    }),
    {
      isImage: true,
      label: "Profile Photo",
      alt: "patient-photo.jpg",
      placeholderText: "File Preview Not Available"
    }
  );

  assert.deepEqual(
    buildPrintableAttachmentViewModel({
      attachment_type: "",
      mime_type: "application/pdf",
      original_filename: "consent-form.pdf"
    }),
    {
      isImage: false,
      label: "Attachment",
      alt: "consent-form.pdf",
      placeholderText: "File Preview Not Available"
    }
  );
});
