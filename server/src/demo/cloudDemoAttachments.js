import { demoAttachmentTemplates } from "./demoAttachmentTemplates.js";
import { buildPrivateObjectPath, uploadPrivateAttachment, storageConfig } from "../storage/privateAttachments.js";
import { createPostgresAttachment } from "../db/postgres/attachments.js";

export async function seedFictionalAttachments(client, prepared, uploadedPaths, adapter = {}) {
  const { demo, patientMap, treatmentMap } = prepared;
  const storage = adapter.config || storageConfig();
  const upload = adapter.upload || uploadPrivateAttachment;
  for (const fixture of demo.attachments) {
    const template = demoAttachmentTemplates[fixture.fileKind];
    const treatment = fixture.ownerType === "treatment" ? treatmentMap.get(fixture.ownerKey) : null;
    const patientKey = treatment
      ? demo.treatments.find(item => item.key === fixture.ownerKey)?.patientKey
      : fixture.ownerKey;
    const patient = patientMap.get(patientKey);
    if (!patient || (fixture.ownerType === "treatment" && !treatment) || !template) {
      throw new Error("Invalid fictional attachment ownership.");
    }
    const path = buildPrivateObjectPath(
      treatment ? "treatments" : "patients",
      treatment?.treatment_id || patient.patient_id, template.mimeType
    );
    const contents = template.buildBuffer(fixture);
    await upload(storage, { path, mimeType: template.mimeType, contents });
    uploadedPaths.push(path);
    await createPostgresAttachment(client, {
      patient_id: patient.patient_id,
      treatment_id: treatment?.treatment_id || null,
      attachment_type: fixture.attachmentType,
      original_filename: fixture.key + template.extension,
      stored_filename: path.split("/").at(-1),
      file_path: path,
      mime_type: template.mimeType,
      file_size: contents.length,
      uploaded_at: demo.anchorDate + "T12:00:00+08:00"
    });
  }
}
