/**
 * Tests unitaires — VersionTrackerAgent
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock('../../db', () => ({
  __esModule: true,
  default: { query: (...args: any[]) => mockQuery(...args) },
  query: (...args: any[]) => mockQuery(...args),
}));

// Mock http/https
jest.mock('https', () => ({
  get: jest.fn(),
}));
jest.mock('http', () => ({
  get: jest.fn(),
}));

import type { CatalogueEntry } from '../../catalogue/types';

// We test discoverBatch and checkBatch logic at the query level
import { discoverBatch, checkBatch } from '../../catalogue/VersionTrackerAgent';

beforeEach(() => { mockQuery.mockReset(); });

// ─── discoverBatch ────────────────────────────────────────────────────────────

describe('VersionTrackerAgent.discoverBatch', () => {
  it('should query unknown/missing entries and return results', async () => {
    // discoverBatch first queries document_catalogue
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no entries to discover
    const results = await discoverBatch(5);
    expect(results).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain("'unknown', 'missing'");
  });
});

// ─── checkBatch ───────────────────────────────────────────────────────────────

describe('VersionTrackerAgent.checkBatch', () => {
  it('should query indexed entries due for check', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const results = await checkBatch(5);
    expect(results).toEqual([]);
    expect(mockQuery.mock.calls[0][0]).toContain("matrix_status = 'indexed'");
    expect(mockQuery.mock.calls[0][0]).toContain("next_check_at <= NOW()");
  });
});
