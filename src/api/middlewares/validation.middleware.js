import { validate as uuidValidate } from 'uuid';
import { BadRequestError } from '../../core/ApiError.js';

export const validateUuid = (params = []) => {
  return (req, res, next) => {
    const errors = [];
    const searchSources = [req.params, req.body, req.query];

    params.forEach((param) => {
      let value;
      for (const source of searchSources) {
        if (source[param]) {
          value = source[param];
          break;
        }
      }

      if (!value || !uuidValidate(value)) {
        errors.push(`Invalid UUID format for ${param}`);
      }
    });

    if (errors.length > 0) {
      throw new BadRequestError(errors.join(', '));
    }

    next();
  };
};

export const limitSourceCodeSize = (maxKb = 50) => {
  return (req, res, next) => {
    const sourceCode = req.body.source_code;
    if (sourceCode && Buffer.byteLength(sourceCode, 'utf8') > maxKb * 1024) {
      throw new BadRequestError(`Source code exceeds limit of ${maxKb}KB`);
    }
    next();
  };
};

/**
 * Detects dangerous patterns in user-submitted source code.
 *
 * This is a best-effort, defense-in-depth layer. It catches common and
 * obvious attack vectors but cannot guarantee 100% coverage against a
 * determined attacker using advanced obfuscation techniques.
 *
 * Known bypass vectors that are NOT fully mitigated at this layer:
 * - Deep obfuscation (e.g., base64-encoded eval payloads)
 * - Dynamic property access (e.g., process['en'+'v'])
 *
 * // TODO: For production-grade isolation, replace or supplement this
 * // middleware with Docker container sandboxing per execution:
 * //   - docker run --network none --memory 128m --cpus 0.5 --read-only ...
 * //   - This enforces hard limits on network, memory, CPU, and filesystem
 * //     access that pattern detection alone cannot provide.
 */
export const detectDangerousPatterns = (req, res, next) => {
  const sourceCode = req.body.source_code;
  if (!sourceCode) return next();

  // Step 1: Unescape Unicode sequences (e.g., \u0066 -> f to catch \u0066s bypass)
  let processedCode = sourceCode;
  try {
    processedCode = sourceCode.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
      return String.fromCharCode(parseInt(grp, 16));
    });
  } catch (e) {
    // Keep original if unescaping fails
  }

  // Step 2: Normalize — remove whitespace, quotes, backticks, operators and
  // common separators to catch concatenation-based bypasses (e.g., 're'+'quire')
  const normalizedCode = processedCode
    .toLowerCase()
    .replace(/[\s'"`+;.,\[\]]/g, '');

  // --- Dangerous pattern definitions ---

  // Patterns checked against the normalized (stripped) code
  const normalizedDangerousPatterns = [
    'require(fs)',
    'require(child_process)',
    'require(os)',
    'require(net)',
    'require(http)',
    'require(https)',
    'require(dgram)',
    'require(vm)',
    'process.exit',
    'process.env',
    'process.binding',       // Low-level Node.js binding bypass
    'process.mainmodule',    // Access to main module paths
    'eval(',
    'os.system',
    'os.popen',
    'os.getcwd',
    'subprocess.run',
    'subprocess.call',
    'subprocess.popen',
    'importlib',             // Python dynamic import
    '__import__',            // Python built-in import bypass
    'rm-rf',
    'chmod',
    'chown',
    'wget',
    'curl',
  ];

  // Patterns checked as plain substrings (before normalization)
  // These are broad but high-signal keywords worth catching directly
  const plainDangerousPatterns = [
    'child_process',
    'process.exit',
    'process.env',
    'process.binding',
    'process.mainModule',
    'eval(',
    'Function(',             // new Function('return process')() bypass
    'os.system',
    'subprocess.run',
    'subprocess.call',
    '__import__',
    'importlib',
    'vm.runInNewContext',    // Node.js vm module sandbox escape
    'vm.runInThisContext',
    'vm.Script',
  ];

  // Step 3: Check normalized code
  const foundInNormalized = normalizedDangerousPatterns.filter((pattern) => {
    const sanitizedPattern = pattern.replace(/[\s'"`+;.,\[\]]/g, '').toLowerCase();
    return normalizedCode.includes(sanitizedPattern);
  });

  // Step 4: Check suspicious require combinations
  const suspicious = [];
  if (normalizedCode.includes('require') && normalizedCode.includes('(fs)'))
    suspicious.push('require + fs');
  if (normalizedCode.includes('require') && normalizedCode.includes('(child_process)'))
    suspicious.push('require + child_process');
  if (normalizedCode.includes('require') && normalizedCode.includes('(vm)'))
    suspicious.push('require + vm (sandbox escape risk)');
  if (normalizedCode.includes('require') && normalizedCode.includes('(net)'))
    suspicious.push('require + net (network access risk)');
  if (normalizedCode.includes('require') && normalizedCode.includes('(os)'))
    suspicious.push('require + os');

  // Step 5: Check plain keywords
  const foundPlain = plainDangerousPatterns.filter((kw) =>
    processedCode.toLowerCase().includes(kw.toLowerCase()) ||
    normalizedCode.includes(kw.replace(/[\s'"`+\[\]]/g, '').toLowerCase())
  );

  const allFound = [...new Set([...foundInNormalized, ...suspicious, ...foundPlain])];

  if (allFound.length > 0) {
    throw new BadRequestError(
      `Potentially dangerous code detected: ${allFound.join(', ')}`
    );
  }

  next();
};