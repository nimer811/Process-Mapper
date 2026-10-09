import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import type { FileStore } from './storage.js';

const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]*(\.[a-z0-9]+)?$/;

/**
 * Files in an Azure Blob Storage container (for hosts without a permanent disk, e.g. Azure Container
 * Apps). Same keys as the local store; the container is private and created on first use.
 */
export class AzureBlobFileStore implements FileStore {
  private readonly container: ContainerClient;
  private ready: Promise<unknown> | null = null;

  constructor(connectionString: string, containerName: string) {
    this.container =
      BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  private blob(key: string) {
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    return this.container.getBlockBlobClient(key);
  }

  private ensure() {
    this.ready ??= this.container.createIfNotExists();
    return this.ready;
  }

  async put(key: string, data: Buffer) {
    await this.ensure();
    // Never overwrite: keys are unique per upload (matches the local store's behaviour).
    await this.blob(key).uploadData(data, { conditions: { ifNoneMatch: '*' } });
  }

  async get(key: string) {
    await this.ensure();
    return this.blob(key).downloadToBuffer();
  }

  async delete(key: string) {
    await this.ensure();
    await this.blob(key).deleteIfExists();
  }
}
