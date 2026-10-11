// Minimal local typings for multer (no @types/multer installed).
// Covers only the surface used by the API: Express.Multer.File and diskStorage.

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
    }
  }
}

declare module 'multer' {
  import type { Request } from 'express';

  export interface StorageEngine {
    _handleFile(req: Request, file: Express.Multer.File, cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void): void;
    _removeFile(req: Request, file: Express.Multer.File, cb: (error: Error | null) => void): void;
  }

  export interface DiskStorageOptions {
    destination?:
      | string
      | ((req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => void);
    filename?(req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void): void;
  }

  export function diskStorage(options: DiskStorageOptions): StorageEngine;
}
