import fs from 'fs/promises';
import path from 'path';
import sandboxRunner from '../../src/sandbox/runner.js';

describe('SandboxRunner Unit Tests', () => {
  beforeAll(async () => {
    await sandboxRunner.prepare();
  });

  test('TC-1.1.1: Should execute JavaScript successfully', async () => {
    const code = 'console.log("Hello Jest");';
    const result = await sandboxRunner.run('javascript', code);

    expect(result.status).toBe('COMPLETED');
    expect(result.stdout.trim()).toBe('Hello Jest');
    expect(result.execution_time_ms).toBeGreaterThanOrEqual(0);
  });

  test('TC-1.1.5: Should cleanup temporary directory after execution', async () => {
    // We need to peek into the runner to see where it stores files
    // Since runner.js uses uuidv4(), we can't easily predict the path
    // BUT we can check if the temp/executions dir contains fewer items than before

    const code = 'console.log("cleanup test")';

    // We'll manually check the temp directory
    const tempRoot = path.join(process.cwd(), 'temp', 'executions');
    const beforeDirs = await fs.readdir(tempRoot);

    await sandboxRunner.run('javascript', code);

    const afterDirs = await fs.readdir(tempRoot);
    expect(afterDirs.length).toBe(beforeDirs.length);
  });

  test('TC-1.1.2: Should execute Python successfully', async () => {
    const code = 'print("Hello from Python")';
    const result = await sandboxRunner.run('python', code);

    expect(result.status).toBe('COMPLETED');
    expect(result.stdout.trim()).toBe('Hello from Python');
  });

  test('TC-1.1.3: Should capture JavaScript syntax errors', async () => {
    const code = 'console.log("Missing paren"';
    const result = await sandboxRunner.run('javascript', code);

    expect(result.status).toBe('FAILED');
    expect(result.stderr).toContain('SyntaxError');
  });

  test('TC-1.1.4: Should handle timeout for infinite loops', async () => {
    const code = 'while(true) {}';
    // Using a shorter timeout for testing if possible,
    // but the runner uses config.SANDBOX_TIMEOUT_MS which is 5s by default
    const result = await sandboxRunner.run('javascript', code);

    expect(result.status).toBe('TIMEOUT');
    expect(result.stderr).toContain('Execution timed out');
  }, 15000);

  test('TC-1.1.6: Should reject unsupported languages', async () => {
    const result = await sandboxRunner.run('ruby', 'puts "hello"');

    expect(result.status).toBe('FAILED');
    expect(result.stderr).toContain('Unsupported language');
  });
});
