import { Router } from 'express';
import multer from 'multer';
import { storage } from '../storage';
import { summarizePolicy, searchPolicyInfo, detectDuplicates } from '../services/geminiService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

// List policies for a user
router.get('/', (req: any, res) => {
  const userId = req.query.userId as string | undefined;
  const policies = storage.readPolicies();
  if (userId) return res.json(policies.filter((p: any) => p.userId === userId));
  res.json(policies);
});

// Create with either file or web data
router.post('/', upload.single('file'), async (req: any, res) => {
  try {
    const body = req.body;
    const policies = storage.readPolicies();
    const newPolicy: any = {
      id: cryptoId(),
      userId: body.userId || 'anonymous',
      name: body.name,
      provider: body.provider,
      type: body.type,
      coverageDetail: body.coverageDetail || undefined,
      fileData: null,
      fileName: null,
      mimeType: body.mimeType || 'text/html',
      sourceUrl: body.sourceUrl || undefined,
      summary: body.summary || undefined,
      addedAt: Date.now()
    };

    if (req.file) {
      newPolicy.fileData = req.file.buffer.toString('base64');
      newPolicy.fileName = req.file.originalname;
      newPolicy.mimeType = req.file.mimetype;
      // try summarizing
      try {
        newPolicy.summary = await summarizePolicy(newPolicy.fileData, newPolicy.mimeType);
      } catch (e) {}
    } else if (body.fileData && body.fileName) {
      newPolicy.fileData = body.fileData;
      newPolicy.fileName = body.fileName;
      newPolicy.mimeType = body.mimeType || newPolicy.mimeType;
      if (!newPolicy.summary) {
        try { newPolicy.summary = await summarizePolicy(newPolicy.fileData, newPolicy.mimeType); } catch (e) {}
      }
    }

    policies.push(newPolicy);
    storage.writePolicies(policies);
    res.json(newPolicy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', upload.single('file'), async (req: any, res) => {
  const id = req.params.id;
  const policies = storage.readPolicies();
  const idx = policies.findIndex((p: any) => p.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const existing = policies[idx];
  const body = req.body;

  existing.name = body.name || existing.name;
  existing.provider = body.provider || existing.provider;
  existing.type = body.type || existing.type;
  existing.coverageDetail = body.coverageDetail || existing.coverageDetail;
  existing.sourceUrl = body.sourceUrl || existing.sourceUrl;
  existing.summary = body.summary || existing.summary;

  if (req.file) {
    existing.fileData = req.file.buffer.toString('base64');
    existing.fileName = req.file.originalname;
    existing.mimeType = req.file.mimetype;
    try { existing.summary = await summarizePolicy(existing.fileData, existing.mimeType); } catch (e) {}
  } else if (body.fileData && body.fileName) {
    existing.fileData = body.fileData;
    existing.fileName = body.fileName;
    existing.mimeType = body.mimeType || existing.mimeType;
    if (!existing.summary) {
      try { existing.summary = await summarizePolicy(existing.fileData, existing.mimeType); } catch (e) {}
    }
  }

  policies[idx] = existing;
  storage.writePolicies(policies);
  res.json(existing);
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const policies = storage.readPolicies();
  const newPolicies = policies.filter((p: any) => p.id !== id);
  storage.writePolicies(newPolicies);
  res.json({ ok: true });
});

router.post('/search', async (req, res) => {
  const { provider, type, name } = req.body;
  try {
    const result = await searchPolicyInfo(provider, type, name);
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: 'Search error' });
  }
});

router.post('/summarize', async (req, res) => {
  const { fileBase64, mimeType } = req.body;
  if (!fileBase64 || !mimeType) return res.status(400).json({ message: 'Missing fileBase64 or mimeType' });
  try {
    const summary = await summarizePolicy(fileBase64, mimeType);
    res.json({ summary });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Summarize error' });
  }
});

router.post('/detect-duplicates', async (req, res) => {
  const policies = req.body.policies as any[] || [];
  try {
    const findings = await detectDuplicates(policies);
    res.json(findings);
  } catch (e) {
    res.status(500).json({ message: 'Error detecting duplicates' });
  }
});

function cryptoId() {
  return (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

export default router;