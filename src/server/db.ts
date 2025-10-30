import { Database } from 'bun:sqlite';
import { exists } from 'node:fs/promises';
import { styleText } from 'node:util';
import { join, resolve } from 'path';

const mountPath = process.env.PBE_APP_DATA_PATH;

console.log('🔍 Initializing database ...');

if (!mountPath) {
  console.error('🚨📂', 'Environment variable not set:', styleText(['grey'], 'PBE_APP_DATA_PATH'));
  process.exit(0);
}

console.log(`📂 ${styleText(['grey'], 'PBE_APP_DATA_PATH')}=${styleText(['yellow'], mountPath)}`);

const dataDir = resolve(mountPath);
const dirExists = await exists(dataDir);

if (!dirExists) {
  console.error(`🚨 PBE app data directory not found, using: ${styleText('yellow', dataDir)}`);
  process.exit(0);
}

const dbPath = join(dataDir, 'pbe-events.sqlite');
const dbFileExists = await exists(dbPath);

console.log(`📚 Connecting to database at ${styleText('cyan', dbPath)}...`);

export const db = new Database(dbPath);

if (!dbFileExists) {
  console.log('🌱 Initializing database schema...');

  const pbeQuery = await Bun.file(join(import.meta.dir, 'pbe.sql')).text();

  db.run(pbeQuery);
}

// Enable foreign key constraints with CASCADE behavior
db.run('PRAGMA foreign_keys = ON;');
db.run('PRAGMA journal_mode = WAL;');
