import { validate as uuidValidate } from 'uuid';
import { BadRequestError } from '../../core/ApiError.js';

export const validateUuid = (params = []) => {
  return (req, res, next) => {
    const errors = [];
    const searchSources = [req.params, req.body, req.query];

    params.forEach(param => {
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

export const detectDangerousPatterns = (req, res, next) => {
  const sourceCode = req.body.source_code;
  if (!sourceCode) return next();

  // 1. Unescape Unicode sequences (e.g., \u0065 -> e)
  let processedCode = sourceCode;
  try {
    processedCode = sourceCode.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
      return String.fromCharCode(parseInt(grp, 16));
    });
  } catch (e) {
    // Keep original if unescaping fails
  }

  // 2. Normalize: Remove whitespace, quotes, backticks, plus signs and common separators
  const normalizedCode = processedCode.toLowerCase().replace(/[\s'"`+;.,]/g, '');

  const dangerousKeywords = [
    'require(fs)',
    'require(child_process)',
    'process.exit',
    'process.env',
    'eval(',
    'exec(',
    'spawn(',
    'os.system',
    'os.popen',
    'subprocess.run',
    'subprocess.call',
    'rm-rf',
    'chmod',
    'chown'
  ];

  // Plain keywords to check in original and normalized code
  const plainKeywords = [
    'eval(', 'exec(', 'spawn(', 'process.exit', 'process.env', 
    'child_process', 'os.system', 'subprocess.run'
  ];

  // 1. Check normalized code against dangerous patterns (handles 're' + 'quire')
  const foundInNormalized = dangerousKeywords.filter(keyword => 
    normalizedCode.includes(keyword.replace(/[\s'"`+]/g, '').toLowerCase())
  );

  // 2. Check for suspicious combos or high-risk single keywords
  const suspicious = [];
  if (normalizedCode.includes('require') && normalizedCode.includes('(fs)')) suspicious.push('require + fs');
  if (normalizedCode.includes('require') && normalizedCode.includes('(child_process)')) suspicious.push('require + child_process');
  
  // 3. Check plain keywords
  const foundPlain = plainKeywords.filter(kw => 
    processedCode.toLowerCase().includes(kw.toLowerCase()) || 
    normalizedCode.includes(kw.replace(/[\s'"`+]/g, '').toLowerCase())
  );

  const allFound = [...new Set([...foundInNormalized, ...suspicious, ...foundPlain])];

  if (allFound.length > 0) {
    throw new BadRequestError(`Potentially dangerous code detected: ${allFound.join(', ')}`);
  }

  next();
};
