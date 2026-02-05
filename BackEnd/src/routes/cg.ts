/**
 * Routes pour gérer les conditions générales (CG)
 * - Récupération des CG standards depuis central_cg
 * - Upload et vectorisation de CG personnalisées dans user_cg
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Configuration multer pour l'upload de fichiers PDF
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
  }
});

// -----------------------------------------------------------------------------
// GET /api/cg/central/by-type-and-insurer
// Récupère les CG disponibles depuis central_cg pour un type et un assureur
// -----------------------------------------------------------------------------
router.get('/central/by-type-and-insurer', async (req: Request, res: Response) => {
  try {
    const { insurance_type_code, insurer_code } = req.query;

    if (!insurance_type_code || !insurer_code) {
      return res.status(400).json({ 
        error: 'Les paramètres insurance_type_code et insurer_code sont requis' 
      });
    }

    const result = await pool.query(
      `SELECT 
        id,
        insurer_code,
        insurance_type_code,
        version,
        type,
        detail,
        url,
        target_filename,
        status,
        metadata,
        created_at
      FROM central_cg
      WHERE insurance_type_code = $1 
        AND insurer_code = $2 
        AND status = 'active'
      ORDER BY version DESC
      LIMIT 1`,
      [insurance_type_code, insurer_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Aucune CG trouvée pour cet assureur et ce type d\'assurance' 
      });
    }

    const cg = result.rows[0];
    
    res.json({
      id: cg.id,
      insurer_code: cg.insurer_code,
      insurance_type_code: cg.insurance_type_code,
      version: cg.version,
      detail: cg.detail,
      url: cg.url,
      formules: cg.metadata?.formules || [],
      options: cg.metadata?.options || { toutes_formules: [] },
      resume_court: cg.metadata?.resume_court || '',
      insurer_name: cg.metadata?.insurer_name || '',
      insurance_type_name: cg.metadata?.insurance_type_name || ''
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des CG:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des CG' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/cg/user/upload
// Upload et vectorisation d'une CG personnalisée
// -----------------------------------------------------------------------------
router.post('/user/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    const { insurance_type_code, insurer_code, user_email } = req.body;
    const file = req.file;

    if (!insurance_type_code || !insurer_code || !user_email) {
      return res.status(400).json({ 
        error: 'Les champs insurance_type_code, insurer_code et user_email sont requis' 
      });
    }

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier PDF fourni' });
    }

    // 1. Extraire le texte du PDF
    const base64Pdf = file.buffer.toString('base64');
    const text = await extractTextFromPdf(base64Pdf);

    // 2. Extraire les métadonnées enrichies
    const insuranceTypeResult = await pool.query(
      'SELECT name FROM insurance_types WHERE code = $1',
      [insurance_type_code]
    );
    const insuranceTypeName = insuranceTypeResult.rows[0]?.name || insurance_type_code;
    
    const enrichedMetadata = await extractEnrichedMetadata(text, insuranceTypeName);

    // 3. Générer l'embedding
    const embedding = await generateEmbedding(text);

    // 4. Récupérer les noms complets de l'assureur et du type
    const insurerResult = await pool.query(
      'SELECT name FROM insurers WHERE code = $1',
      [insurer_code]
    );
    const insurerName = insurerResult.rows[0]?.name || insurer_code;

    // 5. Insérer dans user_cg
    const insertResult = await pool.query(
      `INSERT INTO user_cg (
        insurer_code,
        insurance_type_code,
        version,
        type,
        owner,
        target_filename,
        status,
        content_text,
        embedding,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        insurer_code,
        insurance_type_code,
        '001',
        'CG',
        user_email,
        file.originalname,
        'active',
        text,
        `[${embedding.join(',')}]`,
        JSON.stringify({
          insurer_name: insurerName,
          insurance_type_name: insuranceTypeName,
          source: 'user_upload',
          formules: enrichedMetadata.formules,
          options: enrichedMetadata.options,
          resume_court: enrichedMetadata.resume_court,
          uploaded_at: new Date().toISOString()
        })
      ]
    );

    const cgId = insertResult.rows[0].id;

    res.json({
      success: true,
      id: cgId,
      formules: enrichedMetadata.formules,
      options: enrichedMetadata.options,
      resume_court: enrichedMetadata.resume_court,
      insurer_name: insurerName,
      insurance_type_name: insuranceTypeName
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload de la CG:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'upload de la CG' });
  }
});

// -----------------------------------------------------------------------------
// Fonctions utilitaires
// -----------------------------------------------------------------------------

async function extractTextFromPdf(base64Pdf: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Pdf
      }
    },
    {
      text: 'Extract all text from this PDF document. Return only the raw text content without any formatting or explanations.'
    }
  ]);

  return result.response.text();
}

async function extractEnrichedMetadata(text: string, insuranceTypeName: string): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `Tu es un expert en assurance. Analyse ce document de conditions générales d'assurance ${insuranceTypeName}.

DOCUMENT:
${text.substring(0, 50000)}

Extrais et structure les informations suivantes au format JSON strict (pas de markdown, juste le JSON) :

{
  "formules": ["liste des formules/niveaux de garantie proposés, ex: Tiers, Intermédiaire, Tous risques"],
  "options": {
    "formule1": ["options spécifiques à cette formule"],
    "toutes_formules": ["options communes à toutes les formules"]
  },
  "resume_court": "résumé en 2-3 phrases des garanties principales"
}

Réponds UNIQUEMENT avec le JSON, sans aucun texte avant ou après.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      return JSON.parse(jsonText);
    } catch {
      return {
        formules: [],
        options: { toutes_formules: [] },
        resume_court: "Métadonnées non disponibles"
      };
    }
  } catch {
    return {
      formules: [],
      options: { toutes_formules: [] },
      resume_court: "Métadonnées non disponibles"
    };
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export default router;
