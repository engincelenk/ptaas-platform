import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

export const BUCKET_EVIDENCE = 'ptaas-evidence';
export const BUCKET_REPORTS = 'ptaas-reports';

const PRESIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;

  constructor(private readonly config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(config.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: config.get<string>('NODE_ENV') === 'production',
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });
  }

  async onModuleInit() {
    await this.ensureBuckets();
  }

  private async ensureBuckets() {
    for (const bucket of [BUCKET_EVIDENCE, BUCKET_REPORTS]) {
      try {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
          await this.client.makeBucket(bucket, 'us-east-1');
          this.logger.log(`Created MinIO bucket: ${bucket}`);
        }
        // Enable SSE-S3 default encryption on every bucket so all objects at rest
        // are encrypted with the KMS key configured via MINIO_KMS_SECRET_KEY.
        await this.client.setBucketEncryption(bucket, {
          Rule: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } }],
        });
      } catch (err) {
        this.logger.error(`Failed to ensure bucket ${bucket}`, err);
      }
    }
  }

  async putObject(bucket: string, key: string, data: Buffer | string, contentType = 'application/json'): Promise<void> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await this.client.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, key);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async presignedGetUrl(bucket: string, key: string, expiry = PRESIGNED_URL_EXPIRY_SECONDS): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expiry);
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  /** Deterministic evidence key — recoverable from scanId + findingId without DB lookup. */
  evidenceKey(scanId: string, findingId: string): string {
    return `scans/${scanId}/evidence/${findingId}.json`;
  }
}
