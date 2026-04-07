// Manual mock — src/__mocks__/db.ts
// Utilisé automatiquement par jest.mock('../db') ou jest.mock('../../db') etc.
export const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
