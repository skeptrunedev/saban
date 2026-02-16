/**
 * Integration tests for the enrichment API
 *
 * Run with: bun test tests/enrichment.test.ts
 *
 * Prerequisites:
 * - Server running on localhost:3847
 * - Database with at least one profile
 * - ADMIN_API_KEY set in .env
 */

import { describe, test, expect, beforeAll } from 'bun:test';

const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:3847';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'saban-admin-test-key';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'saban-internal-dev-key-change-in-prod';

// Test organization ID (should exist in DB or be created)
let testOrgId: string;
let testProfileId: number;
let testProfileUrl: string;
let testQualificationId: number;

async function adminFetch(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': ADMIN_API_KEY,
      'X-Organization-Id': testOrgId,
      ...options?.headers,
    },
  });
  return response;
}

async function internalFetch(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': INTERNAL_API_KEY,
      ...options?.headers,
    },
  });
  return response;
}

describe('Enrichment API Integration Tests', () => {
  beforeAll(async () => {
    // Get first organization from DB
    const orgsResponse = await fetch(`${BASE_URL}/api/organizations`, {
      headers: {
        'X-Admin-Api-Key': ADMIN_API_KEY,
      },
    });

    if (!orgsResponse.ok) {
      throw new Error('Failed to get organizations - is the server running?');
    }

    const orgsData = await orgsResponse.json();
    if (!orgsData.data || orgsData.data.length === 0) {
      throw new Error('No organizations found in DB');
    }

    testOrgId = orgsData.data[0].id;
    console.log(`Using test organization: ${testOrgId}`);

    // Get first profile from DB
    const profilesResponse = await adminFetch('/api/profiles?limit=1');
    if (!profilesResponse.ok) {
      throw new Error('Failed to get profiles');
    }

    const profilesData = await profilesResponse.json();
    if (!profilesData.data?.items || profilesData.data.items.length === 0) {
      throw new Error('No profiles found in DB - run the extension to capture some profiles first');
    }

    const profile = profilesData.data.items[0];
    testProfileId = profile.id;
    testProfileUrl = profile.profile_url;
    console.log(`Using test profile: ${testProfileId} (${testProfileUrl})`);
  });

  describe('Qualifications CRUD', () => {
    test('should create a qualification', async () => {
      const response = await adminFetch('/api/qualifications', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Qualification',
          description: 'Test qualification for integration tests',
          criteria: {
            minConnections: 100,
            minFollowers: 50,
            requiredSkills: ['JavaScript', 'TypeScript'],
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      expect(data.data.name).toBe('Test Qualification');

      testQualificationId = data.data.id;
      console.log(`Created test qualification: ${testQualificationId}`);
    });

    test('should list qualifications', async () => {
      const response = await adminFetch('/api/qualifications');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    test('should get qualification by ID', async () => {
      const response = await adminFetch(`/api/qualifications/${testQualificationId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testQualificationId);
    });

    test('should update qualification', async () => {
      const response = await adminFetch(`/api/qualifications/${testQualificationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Updated Test Qualification',
          criteria: {
            minConnections: 200,
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Test Qualification');
      expect(data.data.criteria.minConnections).toBe(200);
    });
  });

  describe('Enrichment Jobs', () => {
    let testJobId: string;

    test('should start enrichment job', async () => {
      const response = await adminFetch('/api/enrichment/enrich', {
        method: 'POST',
        body: JSON.stringify({
          profileIds: [testProfileId],
          qualificationId: testQualificationId,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.job).toBeDefined();
      expect(data.data.job.id).toBeDefined();
      expect(data.data.job.status).toBe('pending');

      testJobId = data.data.job.id;
      console.log(`Created enrichment job: ${testJobId}`);
    });

    test('should list enrichment jobs', async () => {
      const response = await adminFetch('/api/enrichment/jobs');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('should get job status', async () => {
      const response = await adminFetch(`/api/enrichment/jobs/${testJobId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testJobId);
    });
  });

  describe('Internal API (Worker Callbacks)', () => {
    const fakeJobId = 'test-job-' + Date.now();

    test('should reject requests without internal key', async () => {
      const response = await fetch(`${BASE_URL}/api/internal/jobs/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: fakeJobId, status: 'scraping' }),
      });

      expect(response.status).toBe(401);
    });

    test('should update job status via internal API', async () => {
      // First create a job via admin API
      const createResponse = await adminFetch('/api/enrichment/enrich', {
        method: 'POST',
        body: JSON.stringify({
          profileIds: [testProfileId],
        }),
      });
      const createData = await createResponse.json();
      const jobId = createData.data.job.id;

      // Update via internal API
      const response = await internalFetch('/api/internal/jobs/status', {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          status: 'scraping',
          snapshotId: 'test-snapshot-123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify update
      const verifyResponse = await adminFetch(`/api/enrichment/jobs/${jobId}`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.data.status).toBe('scraping');
      expect(verifyData.data.snapshot_id).toBe('test-snapshot-123');
    });

    test('should store enrichment via internal API', async () => {
      const response = await internalFetch('/api/internal/enrichments', {
        method: 'POST',
        body: JSON.stringify({
          profileId: testProfileId,
          connectionCount: 1500,
          followerCount: 500,
          skills: ['JavaScript', 'TypeScript', 'React'],
          about: 'Test about section',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify enrichment stored
      const verifyResponse = await adminFetch(`/api/enrichment/profiles/${testProfileId}`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.data).toBeDefined();
      expect(verifyData.data.connection_count).toBe(1500);
      expect(verifyData.data.follower_count).toBe(500);
    });

    test('should store qualification result via internal API', async () => {
      const response = await internalFetch('/api/internal/qualifications/result', {
        method: 'POST',
        body: JSON.stringify({
          profileId: testProfileId,
          qualificationId: testQualificationId,
          score: 85,
          reasoning: 'Strong candidate with relevant skills',
          passed: true,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify result stored
      const verifyResponse = await adminFetch(
        `/api/enrichment/profiles/${testProfileId}/qualifications`
      );
      const verifyData = await verifyResponse.json();
      expect(verifyData.data).toBeDefined();
      expect(verifyData.data.length).toBeGreaterThan(0);

      const result = verifyData.data.find(
        (r: any) => r.qualification_id === testQualificationId
      );
      expect(result).toBeDefined();
      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
    });

    test('should complete job via internal API', async () => {
      // Create a new job
      const createResponse = await adminFetch('/api/enrichment/enrich', {
        method: 'POST',
        body: JSON.stringify({
          profileIds: [testProfileId],
        }),
      });
      const createData = await createResponse.json();
      const jobId = createData.data.job.id;

      // Complete via internal API
      const response = await internalFetch('/api/internal/jobs/complete', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      });

      expect(response.status).toBe(200);

      // Verify completion
      const verifyResponse = await adminFetch(`/api/enrichment/jobs/${jobId}`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.data.status).toBe('completed');
      expect(verifyData.data.completed_at).toBeDefined();
    });

    test('should get qualification for worker', async () => {
      const response = await internalFetch(`/api/internal/qualifications/${testQualificationId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testQualificationId);
      expect(data.data.criteria).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    test('should delete test qualification', async () => {
      const response = await adminFetch(`/api/qualifications/${testQualificationId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
