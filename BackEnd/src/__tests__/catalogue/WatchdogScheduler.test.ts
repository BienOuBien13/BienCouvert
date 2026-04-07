/**
 * Tests unitaires — WatchdogScheduler
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock('../../db', () => ({
  __esModule: true,
  default: { query: (...args: any[]) => mockQuery(...args) },
  query: (...args: any[]) => mockQuery(...args),
}));

jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../catalogue/VersionTrackerAgent', () => ({
  discoverBatch: jest.fn().mockResolvedValue([]),
  checkBatch: jest.fn().mockResolvedValue([]),
}));

import { startWatchdog, stopWatchdog, isWatchdogRunning } from '../../catalogue/WatchdogScheduler';

beforeEach(() => {
  mockQuery.mockReset();
  stopWatchdog();
});

afterAll(() => {
  stopWatchdog();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WatchdogScheduler', () => {
  it('should start and set running state', async () => {
    // syncMatrix query
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    await startWatchdog();
    expect(isWatchdogRunning()).toBe(true);
    stopWatchdog();
    expect(isWatchdogRunning()).toBe(false);
  });

  it('should stop cleanly', () => {
    stopWatchdog();
    expect(isWatchdogRunning()).toBe(false);
  });

  it('should handle sync error gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    // Should not throw
    await startWatchdog();
    expect(isWatchdogRunning()).toBe(true);
    stopWatchdog();
  });
});
