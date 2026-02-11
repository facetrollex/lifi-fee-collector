import { jest as jestObject } from '@jest/globals';

process.env.NODE_ENV = 'test';
(globalThis as { jest: typeof jestObject }).jest = jestObject;

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useRealTimers();
});
