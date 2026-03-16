import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';

/**
 * Sandbox Runner - Executes code in a controlled (but basic) environment
 */
class SandboxRunner {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'executions');
  }

  /**
   * Ensure temp directory exists
   */
  async prepare() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Run code and return results
   * @param {string} language - javascript | python
   * @param {string} sourceCode - The code to run
   * @returns {Promise<Object>} { status, stdout, stderr, execution_time_ms }
   */
  async run(language, sourceCode) {
    const executionId = uuidv4();
    const workingDir = path.join(this.tempDir, executionId);
    
    // 1. Setup file extensions and commands
    const fileConfigs = {
      javascript: { ext: 'js', cmd: 'node' },
      python: { ext: 'py', cmd: 'python' },
    };

    const runConfig = fileConfigs[language];
    if (!runConfig) {
      return {
        status: 'FAILED',
        stderr: `Unsupported language: ${language}`,
        execution_time_ms: 0
      };
    }

    const filePath = path.join(workingDir, `solution.${runConfig.ext}`);

    try {
      // 2. Create individual working directory for this execution
      await fs.mkdir(workingDir, { recursive: true });
      await fs.writeFile(filePath, sourceCode);

      const startTime = process.hrtime();

      // 3. Execute code using child_process
      const result = await new Promise((resolve) => {
        const timeout = config.SANDBOX_TIMEOUT_MS || 5000;
        
        const child = exec(`${runConfig.cmd} ${filePath}`, {
          timeout,
          maxBuffer: 1024 * 1024, // 1MB buffer limit
          cwd: workingDir,
          env: {
            ...process.env,
            FORCE_COLOR: '0',
            NODE_DISABLE_COLORS: '1',
            PYTHONUNBUFFERED: '1'
          }
        }, (error, stdout, stderr) => {
          const endTime = process.hrtime(startTime);
          const executionTimeMs = Math.round((endTime[0] * 1000) + (endTime[1] / 1000000));

          // Clean up ANSI codes if any still leak through
          const cleanStdout = this.stripAnsi(stdout);
          const cleanStderr = this.stripAnsi(stderr);

          if (error) {
            if (error.killed) {
              resolve({
                status: 'TIMEOUT',
                stdout: cleanStdout,
                stderr: cleanStderr + `\nExecution timed out after ${timeout}ms`,
                execution_time_ms: executionTimeMs
              });
            } else {
              resolve({
                status: 'FAILED',
                stdout: cleanStdout,
                stderr: cleanStderr || error.message,
                execution_time_ms: executionTimeMs
              });
            }
          } else {
            resolve({
              status: 'COMPLETED',
              stdout: cleanStdout,
              stderr: cleanStderr,
              execution_time_ms: executionTimeMs
            });
          }
        });
      });

      return result;

    } catch (error) {
      return {
        status: 'FAILED',
        stderr: error.message,
        execution_time_ms: 0
      };
    } finally {
      // 4. Cleanup working directory with retry logic for Windows
      let retries = 3;
      while (retries > 0) {
        try {
          await fs.rm(workingDir, { recursive: true, force: true });
          break; // Success
        } catch (rmError) {
          retries--;
          if (retries === 0) {
            console.error(`Final cleanup error for ${workingDir}:`, rmError.message);
          } else {
            // Wait 100ms before retrying
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
    }
  }

  /**
   * Remove ANSI escape codes (colors) from string
   */
  stripAnsi(str) {
    if (typeof str !== 'string') return str;
    // eslint-disable-next-line no-control-regex
    return str.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
  }
}

export default new SandboxRunner();
