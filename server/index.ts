// ==============================================================================
// SERVEUR NODE / EXPRESS & VITE MIDDLEWARE (PORT UNIQUE 3000) - SALFA TANAMBAO
// MODE JSON PUR - SANS SQLITE
// ==============================================================================

import express from 'express';
import http from 'http';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { getStore } from './db';
import { apiRouter } from './routes';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Création du serveur HTTP Node pour attacher HMR au même port unique 3000
  const httpServer = http.createServer(app);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Montage de l'API sous /api
  app.use('/api', apiRouter);

  // Healthcheck simple (sans dépendance DB)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'json', store: 'salfa_data.json' });
  });

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

  // Initialisation du store JSON (charge salfa_data.json)
  await getStore();
  console.log('[JSON STORE] Chargé depuis salfa_data.json');

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`==============================================================================`);
    console.log(`  CLINIQUE SALFA TANAMBAO - DISPENSAIRE TOBY BETELA TOLIARA`);
    console.log(`  Application Node.js / React (.tsx) - Port: ${PORT} [JSON PUR]`);
    console.log(`==============================================================================`);
    console.log(`[SERVER] Prêt et en écoute sur : http://0.0.0.0:${PORT}`);
    console.log(`[SERVER] Mode persistence: JSON (salfa_data.json) - SQLite supprimé`);
  });
}

startServer().catch((err) => {
  console.error("[SERVER ERROR]", err);
  process.exit(1);
});
