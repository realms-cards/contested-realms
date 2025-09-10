import '@testing-library/jest-dom';

// Setup for @testing-library/react tests
import { cleanup } from '@testing-library/react';
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // Reset any state before each test
});

afterEach(() => {
  // Clean up after each test
  cleanup();
});