import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth';
import policyRoutes from './routes/policies';
import aiRoutes from './routes/ai';
import path from 'path';

dotenv.config();

const app = express();

// -----------------------------------------------------------------------------
// Configuration CORS & Middleware
// - FRONTEND_ORIGIN peut être une origine unique (ex: https://localhost:3000) ou
//   une liste séparée par des virgules. Lorsqu'il est configuré, seules les
//   origines listées sont autorisées; sinon, '*' autorise toutes les origines.
// - On autorise aussi les requêtes sans `Origin` (ex: curl, Postman) pour les
//   appels en ligne de commande en développement.
// -----------------------------------------------------------------------------

// Support a single origin or a comma-separated list in FRONTEND_ORIGIN
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
let corsOptions: any = { origin: '*' };
if (frontendOrigin && frontendOrigin !== '*') {
  const allowed = frontendOrigin.split(',').map(s => s.trim()).filter(Boolean);
  corsOptions = {
    origin: (origin: any, callback: any) => {
      // Les requêtes sans origin (ex: curl/postman) sont autorisées en dev.
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    }
  };
}

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Point de santé simple pour vérifier que le service est up
app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/ai', aiRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AssurClair backend listening on port ${PORT}`));
