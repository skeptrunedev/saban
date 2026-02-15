import { Router, type Router as RouterType } from 'express';
import {
  insertProfiles,
  getProfileCount,
  getProfiles,
  getProfileById,
  updateProfile,
  getAllTags,
  exportProfiles,
} from '../db.js';
import { withAuth } from '../middleware/auth.js';
import type { Profile, ProfilesQuery } from '@saban/shared';

const router: RouterType = Router();

// Public endpoint for extension compatibility
router.post('/', async (req, res) => {
  try {
    const { profiles, sourceProfileUrl, sourceSection } = req.body;

    if (!profiles || !Array.isArray(profiles)) {
      res.status(400).json({ success: false, error: 'profiles array required' });
      return;
    }

    const inserted = await insertProfiles(profiles, sourceProfileUrl, sourceSection);
    const total = await getProfileCount();

    console.log(`Inserted ${inserted} profiles from ${sourceProfileUrl}. Total: ${total}`);

    res.json({ success: true, inserted, total });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Protected endpoints
router.get('/', withAuth, async (req, res) => {
  try {
    const query: ProfilesQuery = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      search: req.query.search as string | undefined,
      status: req.query.status as Profile['status'] | undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      sortBy: req.query.sortBy as ProfilesQuery['sortBy'],
      sortOrder: req.query.sortOrder as ProfilesQuery['sortOrder'],
    };

    const { profiles, total } = await getProfiles(query);
    const totalPages = Math.ceil(total / (query.limit || 50));

    res.json({
      success: true,
      data: {
        items: profiles,
        total,
        page: query.page || 1,
        limit: query.limit || 50,
        totalPages,
      },
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/export', withAuth, async (req, res) => {
  try {
    const query = {
      search: req.query.search as string | undefined,
      status: req.query.status as Profile['status'] | undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      sortBy: req.query.sortBy as ProfilesQuery['sortBy'],
      sortOrder: req.query.sortOrder as ProfilesQuery['sortOrder'],
    };

    const profiles = await exportProfiles(query);

    const headers = [
      'id',
      'first_name',
      'last_name',
      'vanity_name',
      'profile_url',
      'status',
      'tags',
      'notes',
      'source_profile_url',
      'captured_at',
    ];

    const csvRows = [headers.join(',')];

    for (const profile of profiles) {
      const row = [
        profile.id,
        escapeCSV(profile.first_name || ''),
        escapeCSV(profile.last_name || ''),
        escapeCSV(profile.vanity_name || ''),
        escapeCSV(profile.profile_url || ''),
        escapeCSV(profile.status || 'new'),
        escapeCSV((profile.tags || []).join(';')),
        escapeCSV(profile.notes || ''),
        escapeCSV(profile.source_profile_url || ''),
        profile.captured_at,
      ];
      csvRows.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads-export.csv');
    res.send(csvRows.join('\n'));
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/tags', withAuth, async (_req, res) => {
  try {
    const tags = await getAllTags();
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/:id', withAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const profile = await getProfileById(id);

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.patch('/:id', withAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { notes, tags, status } = req.body;

    const profile = await updateProfile(id, { notes, tags, status });

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
