import { validate as uuidValidate } from 'uuid';

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
      return res.status(400).json({ status: 'error', message: errors.join(', ') });
    }

    next();
  };
};

export const limitSourceCodeSize = (maxKb = 50) => {
  return (req, res, next) => {
    const sourceCode = req.body.source_code;
    if (sourceCode && Buffer.byteLength(sourceCode, 'utf8') > maxKb * 1024) {
      return res.status(400).json({
        status: 'error',
        message: `Source code exceeds limit of ${maxKb}KB`
      });
    }
    next();
  };
};
