// Manual mock — src/services/__mocks__/geminiService.ts
export const getAiClient = jest.fn().mockReturnValue(null);
export const generateEmbedding = jest.fn().mockResolvedValue(null);
export const chunkText = jest.fn().mockImplementation((text: string) => [text]);
export const sendMessageToAssistant = jest.fn().mockResolvedValue('mocked response');
export const sendMessageToAssistantStream = jest.fn().mockResolvedValue(undefined);
export const detectDuplicates = jest.fn().mockResolvedValue([]);
export const getCoverageAnalysis = jest.fn().mockResolvedValue({});
export const resolveCoverageFacts = jest.fn().mockResolvedValue([]);
export const searchPolicyInfo = jest.fn().mockResolvedValue({ summary: '', detectedFormulas: [], availableOptions: [] });
