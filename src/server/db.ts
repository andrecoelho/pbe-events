import { Database } from 'bun:sqlite';
import { exists } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { styleText } from 'node:util';

console.log('🔍 Initializing database ...');

const mountPath = process.env.PBE_APP_DATA_PATH!;
const dataDir = resolve(mountPath);
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
