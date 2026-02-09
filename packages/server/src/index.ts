import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import fs from 'fs';

import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { cupaCatalogRouter } from './routes/cupa-catalog.js';
import { positionsRouter } from './routes/positions.js';
import { auditCyclesRouter } from './routes/audit-cycles.js';
import { reviewsRouter } from './routes/reviews.js';
import { importRouter } from './routes/import.js';
import { dashboardRouter } from './routes/dashboard.js';
import { vpRolesRouter } from './routes/vp-roles.js';
import { equityAnalysisRouter } from './routes/equity-analysis.js';
import { reviewCyclesRouter } from './routes/review-cycles.js';
import { initDatabaseAsync, startAutoSave, closeDatabase } from './db/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Trust proxy (needed when behind Coolify/Traefik for secure cookies)
app.set('trust proxy', 1);

async function main() {
  // Initialize database
  await initDatabaseAsync();
  startAutoSave(5000);

  // Middleware
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/cupa-catalog', cupaCatalogRouter);
  app.use('/api/positions', positionsRouter);
  app.use('/api/audit-cycles', auditCyclesRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/import', importRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/vp-roles', vpRolesRouter);
  app.use('/api/equity-analysis', equityAnalysisRouter);
  app.use('/api/review-cycles', reviewCyclesRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Error handling
  app.use(errorHandler);

  // Start HTTP server
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`HTTP server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Start HTTPS server with self-signed cert (if certs exist)
  const sslKeyPath = process.env.SSL_KEY_PATH || '/app/certs/server.key';
  const sslCertPath = process.env.SSL_CERT_PATH || '/app/certs/server.crt';

  if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    const sslOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };
    https.createServer(sslOptions, app).listen(Number(HTTPS_PORT), '0.0.0.0', () => {
      console.log(`HTTPS server running on https://0.0.0.0:${HTTPS_PORT}`);
    });
  } else {
    console.log('SSL certs not found, skipping HTTPS server (dev mode)');
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    closeDatabase();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    closeDatabase();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
