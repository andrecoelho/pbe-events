import { Database } from 'bun:sqlite';

export const db = new Database('data/pbe-events.sqlite');

// Enable foreign key constraints with CASCADE behavior
db.query('PRAGMA foreign_keys = ON;').run();
