import { Readable } from 'stream';

export interface UploadedStream {
  filename: string;
  originalname: string;
  path: string;
  mimetype: string;
}

export interface StoredFile {
  // path to hand to `removeFile`
  path: string;
  // path below the upload root, like `/2026/10/08/name.mp4`
  relativePath: string;
  size: number;
  modifiedAt: Date;
}

export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  // Streams the body straight into storage without buffering it. The caller
  // has already sniffed the real type from the first bytes, so it passes the
  // detected mime/ext instead of the provider re-sniffing a buffer
  uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream>;
  removeFile(filePath: string): Promise<void>;
  // Every stored file, used by the Clean up orphan scan; providers that can't
  // enumerate their storage leave it out
  listFiles?(): Promise<StoredFile[]>;
  // Presigned URLs handed to the media processor, which has no storage
  // credentials; only cloud storage can mint them
  signDownloadUrl?(fileName: string): Promise<string>;
  signUploadUrl?(fileName: string, contentType: string): Promise<string>;
  // Public URL of a key the media processor wrote through a presigned upload
  publicUrl?(fileName: string): string;
  // Small text files (a transcript) exchanged with the media processor under a
  // key both sides know, where uploadSimple would pick a random one
  readFile?(fileName: string): Promise<string>;
  writeFile?(
    fileName: string,
    body: string,
    contentType: string
  ): Promise<void>;
}
