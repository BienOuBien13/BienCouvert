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

// Support a single origin or a comma-separated list in FRONTEND_ORIGIN
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
let corsOptions: any = { origin: '*' };
if (frontendOrigin && frontendOrigin !== '*') {
  const allowed = frontendOrigin.split(',').map(s => s.trim()).filter(Boolean);
  corsOptions = {
    origin: (origin: any, callback: any) => {
      // Allow browser direct requests with no origin (curl/postman) by returning true when origin is undefined
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    }
  };
}

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));

app.use('/api/auth', authRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/ai', aiRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AssurClair backend listening on port ${PORT}`));
