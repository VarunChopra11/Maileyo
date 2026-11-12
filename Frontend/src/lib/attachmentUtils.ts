/**
 * Email Attachment Constraints and Utilities
 * Enforces 20MB cumulative limit and Base64 conversions for backend dispatch.
 */

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB = 20,971,520 bytes

export interface AttachmentSizeValidationResult {
  valid: boolean;
  totalBytes: number;
  error?: string;
}

export function validateTotalAttachmentSize(
  files: Array<{ size: number }>
): AttachmentSizeValidationResult {
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    const maxMb = MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024);
    return {
      valid: false,
      totalBytes,
      error: `Total attachments size (${mb} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
    };
  }
  return { valid: true, totalBytes };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PreparedAttachmentPayload {
  filename: string;
  content: string;
  mimeType: string;
}

/**
 * Strips data URI prefixes (e.g. 'data:application/pdf;base64,') from base64 strings
 * so that only pure RFC 4648 Base64 payloads are sent to backend services.
 */
export function stripBase64Prefix(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  return trimmed.includes(",") ? trimmed.substring(trimmed.indexOf(",") + 1).trim() : trimmed;
}

export async function convertFileToBase64(
  file: File | { name: string; size: number; type?: string; content?: string; toBase64?: () => Promise<string> }
): Promise<PreparedAttachmentPayload> {
  const filename = file.name;
  const mimeType = (file as { type?: string }).type || "application/octet-stream";

  // Check if object is a MockFile or has toBase64 method
  if (typeof (file as { toBase64?: () => Promise<string> }).toBase64 === "function") {
    const rawContent = await (file as { toBase64: () => Promise<string> }).toBase64();
    return { filename, content: stripBase64Prefix(rawContent), mimeType };
  }

  // If content is already provided as a string
  if (typeof (file as { content?: string }).content === "string") {
    const rawContent = (file as { content: string }).content;
    return { filename, content: stripBase64Prefix(rawContent), mimeType };
  }

  // Native browser File using FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = (reader.result as string) || "";
      // Strip "data:<mime>;base64," prefix for pure base64 backend consumption
      const content = stripBase64Prefix(res);
      resolve({ filename, content, mimeType });
    };
    reader.onerror = () => reject(reader.error || new Error(`Failed to read file ${filename}`));
    reader.readAsDataURL(file as File);
  });
}

/**
 * Backward-compatible alias for convertFileToBase64 conforming to specification.
 */
export const fileToBase64Attachment = convertFileToBase64;

