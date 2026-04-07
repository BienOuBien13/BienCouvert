// Manual mock — src/services/__mocks__/cacheService.ts
export const cacheGet = jest.fn().mockResolvedValue(null);
export const cacheSet = jest.fn().mockResolvedValue(undefined);
export const cacheDel = jest.fn().mockResolvedValue(undefined);
export const cacheDelPattern = jest.fn().mockResolvedValue(undefined);
export const makeCacheKey = jest.fn().mockImplementation((...parts: string[]) => parts.join(':'));
