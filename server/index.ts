// ==============================================================================
// SERVEUR NODE / EXPRESS & VITE MIDDLEWARE (PORT UNIQUE 3000) - SALFA TANAMBAO
// ==============================================================================
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './db';
import { apiRouter } from './routes';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Création du serveur HTTP Node pour attacher HMR au même port unique 3000
  const httpServer = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // Montage de l'API sous /api
  app.use('/api', apiRouter);

  // Vite en mode middleware avec HMR sur le serveur HTTP (évite la création du port 24678)
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  // Initialisation de SQLite sql.js
  await getDb();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`==============================================================================`);
    console.log(`  CLINIQUE SALFA TANAMBAO - DISPENSAIRE TOBY BETELA TOLIARA`);
    console.log(`  Application Node.js / React (.tsx) - Port: ${PORT}`);
    console.log(`==============================================================================`);
    console.log(`[SERVER] Prêt et en écoute sur : http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[SERVER ERROR]", err);
  process.exit(1);
});
