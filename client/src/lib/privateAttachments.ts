import { authenticatedV2Fetch } from "../auth/authApi.js";
import { readBrowserAuthenticationConfig } from "../auth/authConfig.js";

interface UploadPrivateAttachmentInput {
  accessToken: string;
  patientId: string;
  treatmentId?: string | null;
  branchId: string;
  category: string;
  description?: string | null;
  file: File;
}

interface UploadIntentResponse {
  attachment?: { id?: unknown };
  upload?: {
    signedUrl?: unknown;
    token?: unknown;
    objectKey?: unknown;
    expiresInSeconds?: unknown;
  };
}

function requireConfig() {
  const result = readBrowserAuthenticationConfig();
  if (!result.config) throw new Error(result.reason ?? "Secure V2 API configuration is unavailable.");
  return result.config;
}

async function safeMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  } catch {
    // Keep the safe fallback.
  }
  return fallback;
}

export async function uploadPrivateAttachment(input: UploadPrivateAttachmentInput): Promise<void> {
  const config = requireConfig();
  const intentResponse = await authenticatedV2Fetch(
    "/attachments/upload-intent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: input.patientId,
        treatmentId: input.treatmentId ?? null,
        branchId: input.branchId,
        category: input.category,
        originalFilename: input.file.name,
        mimeType: input.file.type,
        sizeBytes: input.file.size,
        description: input.description ?? null
      })
    },
    { accessToken: input.accessToken, apiBaseUrl: config.apiBaseUrl }
  );

  if (!intentResponse.ok) {
    throw new Error(await safeMessage(intentResponse, "Unable to authorize the private attachment upload."));
  }

  const payload = await intentResponse.json() as UploadIntentResponse;
  const attachmentId = payload.attachment?.id;
  const signedUrl = payload.upload?.signedUrl;
  if (typeof attachmentId !== "string" || typeof signedUrl !== "string") {
    throw new Error("The private attachment upload response was invalid.");
  }

  const storageResponse = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.file.type,
      "x-upsert": "false"
    },
    body: input.file
  });
  if (!storageResponse.ok) {
    throw new Error("The private file upload did not complete.");
  }

  const completeResponse = await authenticatedV2Fetch(
    "/attachments/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId })
    },
    { accessToken: input.accessToken, apiBaseUrl: config.apiBaseUrl }
  );

  if (!completeResponse.ok) {
    throw new Error(await safeMessage(completeResponse, "The uploaded file could not be verified."));
  }
}
