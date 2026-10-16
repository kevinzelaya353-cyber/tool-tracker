import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Almacenamiento de objetos. El bucket es privado: se lee solo con URLs firmadas de corta duración. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  signedUrl(key: string, ttlSec: number): Promise<string>;
}

export interface S3StorageConfig {
  endpoint: string;
  /** Endpoint alcanzable por los teléfonos (p. ej. IP de la LAN en desarrollo). Por defecto = endpoint. */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function s3Storage(cfg: S3StorageConfig): ObjectStorage & { ensureBucket(): Promise<void> } {
  const make = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  const client = make(cfg.endpoint);
  // La firma incluye el host, así que se firma con el endpoint público.
  const signer = cfg.publicEndpoint && cfg.publicEndpoint !== cfg.endpoint ? make(cfg.publicEndpoint) : client;

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: "private, max-age=600",
          ContentDisposition: "inline",
        }),
      );
    },

    async remove(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: cfg.bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },

    signedUrl(key, ttlSec) {
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: ttlSec });
    },

    /** Solo para desarrollo: crea el bucket en MinIO si no existe. */
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
      }
    },
  };
}
