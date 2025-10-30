import { exists, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { styleText } from 'node:util';

const mountPath = process.env.PBE_APP_DATA_PATH;

if (!mountPath) {
  console.error('🚨📂', 'Environment variable not set:', styleText(['grey'], 'PBE_APP_DATA_PATH'));
  process.exit(0);
}

console.log(`📂 ${styleText(['grey'], 'PBE_APP_DATA_PATH')}=${styleText(['yellow'], mountPath)}`);

const dataDir = resolve(mountPath);
const dataDirExists = await exists(dataDir);

if (!dataDirExists) {
  console.error(`🚨 PBE app data directory not found, using: ${styleText('yellow', dataDir)}`);
  process.exit(0);
}

const imageDir = join(dataDir, 'user-image');
const imageDirExists = await exists(imageDir);

if (!imageDirExists) {
  mkdir(imageDir, { recursive: true });
  console.log(`📂 Created user image directory at ${styleText('cyan', imageDir)}`);
}
