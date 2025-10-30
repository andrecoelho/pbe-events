import { exists, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { styleText } from 'node:util';

const mountPath = process.env.PBE_APP_DATA_PATH;

if (!mountPath) {
  console.error('🚨📂', 'Environment variable missing:', styleText(['grey'], 'PBE_APP_DATA_PATH'));
  process.exit(0);
}

console.log(`📜 ${styleText(['grey'], 'PBE_APP_DATA_PATH')}=${styleText(['yellow'], mountPath)}`);

const dataDir = resolve(mountPath);
const dataDirExists = await exists(dataDir);

if (!dataDirExists) {
  console.error(`🚨 PBE app data directory not found, using: ${styleText('yellow', dataDir)}`);
  process.exit(0);
}

console.log(`📂 ${styleText(['grey'], 'App Data')}:${styleText(['magenta'], dataDir)}`);

const imageDir = join(dataDir, 'user-images');
const imageDirExists = await exists(imageDir);

if (!imageDirExists) {
  mkdir(imageDir, { recursive: true });
  console.log(`✅ Created user images directory at ${styleText('magenta', imageDir)}`);
}

const initDB = process.env.PBE_INIT_DB === 'true';

global.PBE = {
  mountPath,
  dataDir,
  imageDir,
  initDB
} as typeof global.PBE;
