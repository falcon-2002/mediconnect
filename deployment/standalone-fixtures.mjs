import { generateKeyPairSync } from 'node:crypto';
import { chmod, copyFile, mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh, test-only material. No production key, environment file or cloud secret is read.
export async function ephemeralFixtures(h2Source) {
  const directory = await mkdtemp(join(tmpdir(), 'mediconnect-fixture-'));
  const privateKeyPath = join(directory, 'private.pem'), publicKeyPath = join(directory, 'public.pem');
  const files = [privateKeyPath, publicKeyPath];
  const cleanup = async () => {
    // Delete only explicitly named files in the freshly created directory; never recurse.
    await Promise.all(files.map(file => unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; })));
    await rmdir(directory);
  };
  try {
    await chmod(directory, 0o750);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o640 });
    await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
    if (h2Source) {
      const h2 = join(directory, 'h2.jar'); files.push(h2);
      await copyFile(h2Source, h2); await chmod(h2, 0o644);
    }
    return { directory, privateKeyPath, publicKeyPath, privateKey, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
