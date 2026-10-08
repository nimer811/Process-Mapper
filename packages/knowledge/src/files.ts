import { fileTypeFromBuffer } from 'file-type';
import { unzipSync } from 'fflate';

export type FileKind = 'pdf' | 'docx' | 'xlsx' | 'txt';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;

export class UnsupportedFileError extends Error {}

const MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

/**
 * Identifies the file from its bytes (never trusting the extension or the browser's MIME type)
 * and rejects anything outside the allow-list, including oversized or zip-bomb Office files.
 */
export async function inspectFile(
  buffer: Buffer,
  filename: string,
): Promise<{ kind: FileKind; mimeType: string }> {
  if (buffer.length === 0) throw new UnsupportedFileError('The file is empty');
  if (buffer.length > MAX_UPLOAD_BYTES)
    throw new UnsupportedFileError('The file is larger than 25 MB');

  const detected = await fileTypeFromBuffer(buffer);
  let kind: FileKind | null = null;
  if (detected?.ext === 'pdf') kind = 'pdf';
  else if (detected?.ext === 'docx') kind = 'docx';
  else if (detected?.ext === 'xlsx') kind = 'xlsx';
  else if (!detected && /\.(txt|md|csv)$/i.test(filename) && isUtf8Text(buffer)) kind = 'txt';

  if (!kind) {
    throw new UnsupportedFileError(
      'Unsupported file type. Upload PDF, Word (.docx), Excel (.xlsx) or plain text.',
    );
  }
  if (kind === 'docx' || kind === 'xlsx') checkZip(buffer);
  return { kind, mimeType: MIME[kind] };
}

function isUtf8Text(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** Reads only the zip directory (no decompression) to reject decompression bombs. */
function checkZip(buffer: Buffer) {
  let total = 0;
  let entries = 0;
  unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      total += f.originalSize;
      entries++;
      return false;
    },
  });
  if (entries > MAX_ZIP_ENTRIES || total > MAX_UNZIPPED_BYTES) {
    throw new UnsupportedFileError('The file expands to an unreasonable size and was rejected');
  }
}
