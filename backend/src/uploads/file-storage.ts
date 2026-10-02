import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

/**
 * Where the (already encrypted) bytes of an upload live. UploadsService encrypts before `put`
 * and decrypts after `get`, so a storage backend only ever sees ciphertext.
 */
export interface FileStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Removes the stored bytes; removing something that is already gone is not an error. */
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

/** Files on the server's disk: fine for local development; a serverless host's disk does not persist. */
export class LocalFileStorage implements FileStorage {
  constructor(private root: string) {}

  async put(key: string, body: Buffer) {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string) {
    return readFile(join(this.root, key));
  }

  async delete(key: string) {
    await rm(join(this.root, key), { force: true });
  }
}

/** The error a storage backend gives for a file it simply does not have (as opposed to a failure). */
export class FileNotFoundError extends Error {}

/**
 * New files go to `primary` (S3); a file `primary` does not have is looked for in `legacy` (the server's
 * disk). So switching to S3 doesn't make files uploaded before it unreadable, with or without moving them.
 */
export class FallbackFileStorage implements FileStorage {
  constructor(
    private primary: FileStorage,
    private legacy: FileStorage,
  ) {}

  put(key: string, body: Buffer) {
    return this.primary.put(key, body);
  }

  async get(key: string) {
    try {
      return await this.primary.get(key);
    } catch (err) {
      if (!(err instanceof FileNotFoundError)) throw err;
      return this.legacy.get(key);
    }
  }

  async delete(key: string) {
    await this.primary.delete(key);
    await this.legacy.delete(key);
  }
}

/**
 * Amazon S3. Objects are private and also encrypted by S3 at rest (SSE-KMS when a key id is given,
 * otherwise SSE-S3). Credentials come from the usual AWS environment (AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, or an instance/task role). Nothing is ever read straight from S3 by a
 * browser: files are streamed through the API, which checks who is asking and records the view.
 */
export class S3FileStorage implements FileStorage {
  private sdk?: Promise<{ client: import('@aws-sdk/client-s3').S3Client; commands: typeof import('@aws-sdk/client-s3') }>;

  constructor(
    private bucket: string,
    private region: string,
    private kmsKeyId?: string,
  ) {}

  // Loaded on first use, so an app that stores files on disk never pays for the SDK.
  private load() {
    this.sdk ??= import('@aws-sdk/client-s3').then((commands) => ({ client: new commands.S3Client({ region: this.region }), commands }));
    return this.sdk;
  }

  async put(key: string, body: Buffer) {
    const { client, commands } = await this.load();
    await client.send(
      new commands.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: this.kmsKeyId ? 'aws:kms' : 'AES256',
        ...(this.kmsKeyId && { SSEKMSKeyId: this.kmsKeyId }),
      }),
    );
  }

  async get(key: string) {
    const { client, commands } = await this.load();
    try {
      const res = await client.send(new commands.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw new Error(`S3 returned no body for ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) throw new FileNotFoundError(`No object ${key}`);
      throw err;
    }
  }

  async delete(key: string) {
    const { client, commands } = await this.load();
    await client.send(new commands.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
