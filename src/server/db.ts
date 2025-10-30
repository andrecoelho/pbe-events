import { Database } from 'bun:sqlite';
import { exists } from 'node:fs/promises';
import { join } from 'node:path';
import { styleText } from 'node:util';

const dbPath = join(global.PBE.dataDir, 'pbe-events.sqlite');
const dbFileExists = await exists(dbPath);

export const db = new Database(dbPath);

if (!dbFileExists) {
  const pbeQuery = await Bun.file(join(import.meta.dir, 'pbe.sql')).text();

  db.run(pbeQuery);

  console.log('✅ Database initialized');
}

console.log(`📚 ${styleText(['grey'], 'Database File')}:${styleText(['cyan'], dbPath)}`);

// Enable foreign key constraints with CASCADE behavior
db.run('PRAGMA foreign_keys = ON;');
db.run('PRAGMA journal_mode = WAL;');
