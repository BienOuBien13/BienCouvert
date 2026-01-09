import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth';
import policyRoutes from './routes/policies';
import aiRoutes from './routes/ai';
import path from 'path';

// -----------------------------------------------------------------------------
// Point d'entrée principal du serveur backend AssurClair
// Ce fichier configure Express avec les middlewares nécessaires et monte
// les différentes routes de l'API REST.
// -----------------------------------------------------------------------------

// Chargement des variables d'environnement depuis le fichier .env
dotenv.config();

const app = express();

// -----------------------------------------------------------------------------
// Configuration CORS (Cross-Origin Resource Sharing)
// Contrôle quelles origines (domaines) sont autorisées à accéder à l'API.
// 
// Variable d'environnement FRONTEND_ORIGIN :
// - Si définie : seules les origines listées sont autorisées (séparées par des virgules)
//   Exemple : "http://localhost:3000,https://app.assurclair.fr"
// - Si vide ou '*' : toutes les origines sont autorisées (mode développement)
// 
// Note : Les requêtes sans header Origin (ex: curl, Postman) sont autorisées
// en développement pour faciliter les tests en ligne de commande.
// -----------------------------------------------------------------------------

// Récupération de la configuration CORS depuis les variables d'environnement
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
let corsOptions: any = { origin: '*' };  // Par défaut : toutes origines autorisées

// Si une configuration spécifique est fournie, on configure CORS de manière restrictive
if (frontendOrigin && frontendOrigin !== '*') {
  // Parse la liste d'origines autorisées (séparées par des virgules)
  const allowed = frontendOrigin.split(',').map(s => s.trim()).filter(Boolean);
  
  corsOptions = {
    origin: (origin: any, callback: any) => {
      // Cas 1 : Requête sans origin (curl, Postman, etc.) -> autorisé en dev
      if (!origin) return callback(null, true);
      
      // Cas 2 : Origin dans la liste blanche -> autorisé
      if (allowed.includes(origin)) return callback(null, true);
      
      // Cas 3 : Origin non autorisée -> rejet
      return callback(new Error('Not allowed by CORS'), false);
    }
  };
}

// Application des middlewares
app.use(cors(corsOptions));                               // Gestion CORS
app.use(bodyParser.json({ limit: '10mb' }));            // Parse JSON (max 10MB pour documents base64)
app.use(bodyParser.urlencoded({ extended: true }));     // Parse form data

// -----------------------------------------------------------------------------
// Routes de l'API
// -----------------------------------------------------------------------------

/**
 * Route GET /
 * Endpoint de santé (health check) pour vérifier que le serveur est opérationnel.
 * Utile pour les systèmes de monitoring et les load balancers.
 */
app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));

// Montage des routes principales de l'API
app.use('/api/auth', authRoutes);        // Routes d'authentification (login, register, profile)
app.use('/api/policies', policyRoutes);  // Routes de gestion des polices et du référentiel CG
app.use('/api/ai', aiRoutes);            // Routes d'interaction avec l'IA (chat, analyse)

// -----------------------------------------------------------------------------
// Démarrage du serveur
// -----------------------------------------------------------------------------

const PORT = process.env.PORT || 4000;  // Port configurable via variable d'environnement
app.listen(PORT, () => console.log(`AssurClair backend listening on port ${PORT}`));
app.listen(PORT, () => console.log(`AssurClair backend listening on port ${PORT}`));
