import '@testing-library/jest-dom';

// Setup for @testing-library/react tests
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  // Reset any state before each test
});

afterEach(() => {
  // Clean up after each test
  cleanup();
});