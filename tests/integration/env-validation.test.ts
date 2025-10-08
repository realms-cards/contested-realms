/**
 * Integration Test: Environment Validation Script
 *
 * Tests the environment validation script.
 * Expected: Test FAILS initially (script may not exist or not executable)
 */

import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// These tests require a running socket server
// Skip in CI, run manually in integration environment
describe('Integration: Environment Validation', () => {
  it('should exit with code 1 when SOCKET_SERVER_URL is missing', async () => {
    const env = { ...process.env };
    delete env.SOCKET_SERVER_URL;

    try {
      await execAsync('scripts/validate-socket-env.sh', { env });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      const err = error as { code: number };
      expect(err.code).toBe(1);
    }
  });

  it('should exit with code 0 when all variables are set', async () => {
    const env = {
      ...process.env,
      SOCKET_SERVER_URL: 'http://localhost:3010',
      NEXT_PUBLIC_WS_URL: 'http://localhost:3010',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    };

    // This will FAIL if socket server is not running
    try {
      const { stdout } = await execAsync('scripts/validate-socket-env.sh', { env });
      expect(stdout).toContain('Socket environment valid');
    } catch {
      // Expected to fail if server not running
      expect(true).toBe(false);
    }
  });
});
