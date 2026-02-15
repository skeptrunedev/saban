import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import profilesRoutes from './routes/profiles.js';
import { getProfileCount } from './db.js';

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors({
  origin: ['http://localhost:5173', 'chrome-extension://'],
  credentials: true,
}));
// Also allow requests without origin (like from extension background scripts)
app.use((req, res, next) => {
  if (!req.headers.origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profilesRoutes);

// Legacy route for extension compatibility
app.post('/profiles', async (req, res) => {
  const { profiles, sourceProfileUrl, sourceSection } = req.body;

  if (!profiles || !Array.isArray(profiles)) {
    res.status(400).json({ error: 'profiles array required' });
    return;
  }

  try {
    const { insertProfiles } = await import('./db.js');
    const inserted = await insertProfiles(profiles, sourceProfileUrl, sourceSection);
    const total = await getProfileCount();

    console.log(`Inserted ${inserted} profiles from ${sourceProfileUrl}. Total: ${total}`);

    res.json({ success: true, inserted, total });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/stats', async (_req, res) => {
  try {
    const total = await getProfileCount();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`LinkedIn profiles server running on http://localhost:${PORT}`);
});
