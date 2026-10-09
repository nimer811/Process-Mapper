import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AzureBlobFileStore } from './azure-blob-store.js';

// Azurite: Microsoft's local Azure Storage emulator, with its well-known development account.
const ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

describe('AzureBlobFileStore', () => {
  let azurite: StartedTestContainer;
  let store: AzureBlobFileStore;

  beforeAll(async () => {
    azurite = await new GenericContainer('mcr.microsoft.com/azure-storage/azurite:3.35.0')
      .withCommand(['azurite-blob', '--blobHost', '0.0.0.0', '--skipApiVersionCheck', '--loose'])
      .withExposedPorts(10000)
      .start();
    const endpoint = `http://${azurite.getHost()}:${azurite.getMappedPort(10000)}/devstoreaccount1`;
    store = new AzureBlobFileStore(
      `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=${ACCOUNT_KEY};BlobEndpoint=${endpoint};`,
      'process-ai-test',
    );
  }, 120_000);
  afterAll(async () => {
    await azurite?.stop();
  });

  it('stores, reads and deletes files, never overwriting', async () => {
    await store.put('documents/abc.txt', Buffer.from('hello'));
    expect((await store.get('documents/abc.txt')).toString()).toBe('hello');
    await expect(store.put('documents/abc.txt', Buffer.from('again'))).rejects.toThrow();
    await store.delete('documents/abc.txt');
    await expect(store.get('documents/abc.txt')).rejects.toThrow();
    await store.delete('documents/abc.txt'); // already gone: fine
  });

  it('refuses unsafe keys', async () => {
    await expect(store.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});
