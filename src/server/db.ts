import { Database } from 'bun:sqlite';

export const db = new Database('data/pbe.sqlite');
