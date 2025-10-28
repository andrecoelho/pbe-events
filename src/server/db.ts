import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'path';

const path = join(import.meta.dir, '../../data/pbe-events.sqlite');
const dbFileExists = await Bun.file(path).exists();

if (!dbFileExists) {
  console.log('🚧 Database file not found, creating new database...');
  await mkdir(dirname(path), { recursive: true });
}

console.log(`🔗 Connecting to database at ${path}...`);

export const db = new Database(path);

if (!dbFileExists) {
  console.log('🌱 Initializing database schema...');

  const pbeQuery = await Bun.file(join(import.meta.dir, 'pbe.sql')).text();

  db.run(pbeQuery);
}

// Enable foreign key constraints with CASCADE behavior
db.query('PRAGMA foreign_keys = ON;').run();
