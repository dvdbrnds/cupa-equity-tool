import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

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
import { initDatabaseAsync, startAutoSave, closeDatabase } from './db/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

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

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

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
