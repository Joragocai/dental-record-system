export const suggestedAttachmentTypes = [
  "Profile Photo",
  "Pre-op Photo",
  "Post-op Photo",
  "X-ray",
  "Panoramic X-ray",
  "Periapical X-ray",
  "Intraoral Photo",
  "Extraoral Photo",
  "Consent Form",
  "Prescription",
  "Lab Result",
  "Medical Clearance",
  "Treatment Plan",
  "Follow-up Photo",
  "Other Clinical Document"
];

const legacyAttachmentTypeLabels = {
  profile_photo: "Profile Photo",
  pre_op_photo: "Pre-op Photo",
  post_op_photo: "Post-op Photo",
  xray: "X-ray",
  other: "Other"
};

export function formatAttachmentType(type) {
  if (!type) return "Uncategorized Attachment";
  return legacyAttachmentTypeLabels[type] || type;
}

export function formatUploadedAt(uploadedAt) {
  if (!uploadedAt) return "-";
  const date = new Date(uploadedAt);
  if (Number.isNaN(date.getTime())) return uploadedAt;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
