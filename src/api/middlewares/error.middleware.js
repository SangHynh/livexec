import { ApiError } from '../../core/ApiError.js';

const errorMiddleware = (err, _req, res, _next) => {
  let { statusCode, message } = err;

  if (!(err instanceof ApiError)) {
    statusCode = 500;
    message = err.message || 'Internal Server Error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorCode: err.errorCode || 'INTERNAL_ERROR',
    errors: err.errors || [],
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default errorMiddleware;
