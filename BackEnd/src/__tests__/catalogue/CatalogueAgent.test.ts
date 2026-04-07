/**
 * Tests unitaires — CatalogueAgent
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock('../../db', () => ({
  __esModule: true,
  default: { query: (...args: any[]) => mockQuery(...args) },
  query: (...args: any[]) => mockQuery(...args),
}));

import {
  getMatrix,
  syncMatrix,
  getEntry,
  getEntriesDueForCheck,
  updateEntryStatus,
} from '../../catalogue/CatalogueAgent';

beforeEach(() => { mockQuery.mockReset(); });

// ─── getMatrix ────────────────────────────────────────────────────────────────

describe('CatalogueAgent.getMatrix', () => {
  it('should return cells, stats, and referentials', async () => {
    // Cells query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          insurer_code: 'MMA01', insurer_label: 'MMA',
          insurance_type_code: 'HAB01', insurance_type_label: 'Habitation',
          doc_type: 'CG', matrix_status: 'indexed',
          central_cg_id: 1, current_url: 'https://x.pdf',
          indexed_at: '2025-01-01', last_checked_at: '2025-06-01',
        },
        {
          insurer_code: 'AXA01', insurer_label: 'AXA',
          insurance_type_code: 'HAB01', insurance_type_label: 'Habitation',
          doc_type: 'CG', matrix_status: 'unknown',
          central_cg_id: null, current_url: null,
          indexed_at: null, last_checked_at: null,
        },
      ],
    });
    // Stats query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { matrix_status: 'indexed', count: '1' },
        { matrix_status: 'unknown', count: '1' },
      ],
    });
    // Insurers
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'MMA01', label: 'MMA' }, { code: 'AXA01', label: 'AXA' }],
    });
    // Types
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'HAB01', label: 'Habitation' }],
    });

    const result = await getMatrix();

    expect(result.cells).toHaveLength(2);
    expect(result.stats.total).toBe(2);
    expect(result.stats.indexed).toBe(1);
    expect(result.stats.unknown).toBe(1);
    expect(result.stats.coverage_percent).toBe(50);
    expect(result.insurers).toHaveLength(2);
    expect(result.insurance_types).toHaveLength(1);
  });

  it('should pass filters to the query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getMatrix({ insurer_code: 'MMA01', matrix_status: 'indexed' });

    // First call (cells) should contain WHERE with MMA01 and indexed
    const cellsCall = mockQuery.mock.calls[0];
    expect(cellsCall[0]).toContain('dc.insurer_code');
    expect(cellsCall[1]).toContain('MMA01');
    expect(cellsCall[1]).toContain('indexed');
  });
});

// ─── syncMatrix ───────────────────────────────────────────────────────────────

describe('CatalogueAgent.syncMatrix', () => {
  it('should return the number of inserted rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
    const inserted = await syncMatrix();
    expect(inserted).toBe(5);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO document_catalogue');
  });
});

// ─── getEntry ─────────────────────────────────────────────────────────────────

describe('CatalogueAgent.getEntry', () => {
  it('should return an entry by id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, insurer_code: 'MMA01' }] });
    const entry = await getEntry(1);
    expect(entry).toBeDefined();
    expect(entry?.insurer_code).toBe('MMA01');
  });

  it('should return null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const entry = await getEntry(999);
    expect(entry).toBeNull();
  });
});

// ─── getEntriesDueForCheck ────────────────────────────────────────────────────

describe('CatalogueAgent.getEntriesDueForCheck', () => {
  it('should query entries with next_check_at <= NOW()', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const entries = await getEntriesDueForCheck(10);
    expect(entries).toHaveLength(2);
    expect(mockQuery.mock.calls[0][0]).toContain('next_check_at <= NOW()');
  });
});

// ─── updateEntryStatus ────────────────────────────────────────────────────────

describe('CatalogueAgent.updateEntryStatus', () => {
  it('should update matrix_status for a given id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateEntryStatus(1, 'indexed');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('matrix_status');
    expect(mockQuery.mock.calls[0][1]).toContain('indexed');
    expect(mockQuery.mock.calls[0][1]).toContain(1);
  });

  it('should include extra fields in the update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateEntryStatus(1, 'discovered', {
      discovered_url: 'https://new.pdf',
      discovered_sha256: 'abc123',
    } as any);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('discovered_url');
    expect(sql).toContain('discovered_sha256');
  });
});
