// Manual mock — src/__mocks__/storage.ts
export const storage = {
  readPolicies: jest.fn().mockResolvedValue([]),
  readAnalysisProfile: jest.fn().mockResolvedValue(null),
  searchPolicyEmbeddings: jest.fn().mockResolvedValue([]),
  searchCentralCg: jest.fn().mockResolvedValue([]),
  vectorizePolicyPdf: jest.fn().mockResolvedValue(undefined),
};
