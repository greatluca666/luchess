// server/src/index.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.LUCHESS_DB_PATH ?? path.join(__dirname, '../../data/games.sqlite');

const server = createApp({ dbPath: DB_PATH });
server.listen(PORT, () => {
  console.log(`luchess listening on :${PORT}`);
});
