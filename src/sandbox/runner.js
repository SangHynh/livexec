import { spawn } from 'child_process';
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
    const isWindows = process.platform === 'win32';
    const fileConfigs = {
      javascript: {
        ext: 'js',
        cmd: 'node',
        args: [
          `--max-old-space-size=${config.SANDBOX.MEMORY_LIMIT_MB || 128}`,
        ],
      },
      python: { ext: 'py', cmd: isWindows ? 'py' : 'python3', args: [] },
    };

    const runConfig = fileConfigs[language];
    if (!runConfig) {
      return {
        status: 'FAILED',
        stderr: `Unsupported language: ${language}`,
        execution_time_ms: 0,
      };
    }

    const filePath = path.join(workingDir, `solution.${runConfig.ext}`);

    try {
      // 2. Create individual working directory for this execution
      await fs.mkdir(workingDir, { recursive: true });
      await fs.writeFile(filePath, sourceCode);

      const startTime = process.hrtime();
      let child;

      // 3. Execute code using spawn for better control
      const result = await new Promise((resolve) => {
        const timeoutMs = config.SANDBOX.TIMEOUT_MS || 5000;

        child = spawn(runConfig.cmd, [...runConfig.args, filePath], {
          cwd: workingDir,
          detached: !isWindows, // Detached mode is different on Windows
          env: {
            ...process.env,
            FORCE_COLOR: '0',
            NODE_DISABLE_COLORS: '1',
            PYTHONUNBUFFERED: '1',
          },
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timeout = setTimeout(() => {
          killed = true;
          try {
            if (isWindows) {
              // On Windows, use taskkill to kill the entire tree
              spawn('taskkill', ['/F', '/T', '/PID', child.pid]);
            } else {
              // Kill the entire process group on Unix
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch (e) {
            // Process might have already exited
          }
        }, timeoutMs);

        const MAX_OUTPUT_SIZE = config.SANDBOX.MAX_OUTPUT_SIZE || 1024 * 1024;

        child.stdout.on('data', (data) => {
          if (stdout.length < MAX_OUTPUT_SIZE) {
            stdout += data.toString();
            if (stdout.length >= MAX_OUTPUT_SIZE) {
              stdout =
                stdout.slice(0, MAX_OUTPUT_SIZE) +
                '\n[Output truncated due to size limit]';
            }
          }
        });

        child.stderr.on('data', (data) => {
          if (stderr.length < MAX_OUTPUT_SIZE) {
            stderr += data.toString();
            if (stderr.length >= MAX_OUTPUT_SIZE) {
              stderr =
                stderr.slice(0, MAX_OUTPUT_SIZE) +
                '\n[Output truncated due to size limit]';
            }
          }
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          const endTime = process.hrtime(startTime);
          const executionTimeMs = Math.round(
            endTime[0] * 1000 + endTime[1] / 1000000
          );
          resolve({
            status: 'FAILED',
            stdout: this.stripAnsi(stdout),
            stderr: this.stripAnsi(stderr || err.message),
            execution_time_ms: executionTimeMs,
          });
        });

        child.on('exit', (code, signal) => {
          clearTimeout(timeout);
          const endTime = process.hrtime(startTime);
          const executionTimeMs = Math.round(
            endTime[0] * 1000 + endTime[1] / 1000000
          );

          const cleanStdout = this.stripAnsi(stdout);
          const cleanStderr = this.stripAnsi(stderr);

          if (killed) {
            resolve({
              status: 'TIMEOUT',
              stdout: cleanStdout,
              stderr:
                cleanStderr + `\nExecution timed out after ${timeoutMs}ms`,
              execution_time_ms: executionTimeMs,
            });
          } else if (code !== 0) {
            resolve({
              status: 'FAILED',
              stdout: cleanStdout,
              stderr: cleanStderr || `Process exited with code ${code}`,
              execution_time_ms: executionTimeMs,
            });
          } else {
            resolve({
              status: 'COMPLETED',
              stdout: cleanStdout,
              stderr: cleanStderr,
              execution_time_ms: executionTimeMs,
            });
          }
        });
      });

      return result;
    } catch (error) {
      return {
        status: 'FAILED',
        stderr: error.message,
        execution_time_ms: 0,
      };
    } finally {
      // Emergency kill to release file handles before deletion
      try {
        if (isWindows) {
          spawn('taskkill', ['/F', '/T', '/PID', child.pid]);
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch (e) {
        // Ignored
      }

      // 4. Cleanup working directory with retry logic for Windows
      let retries = 3;
      while (retries > 0) {
        try {
          await fs.rm(workingDir, { recursive: true, force: true });
          break; // Success
        } catch (rmError) {
          retries--;
          if (retries === 0) {
            console.error(
              `Final cleanup error for ${workingDir}:`,
              rmError.message
            );
          } else {
            // Wait 100ms before retrying
            await new Promise((resolve) => setTimeout(resolve, 100));
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
