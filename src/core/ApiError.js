class ApiError extends Error {
  constructor(
    statusCode,
    message = 'Something went wrong',
    errorCode = 'INTERNAL_ERROR',
    errors = [],
    stack = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', errors = []) {
    super(400, message, 'BAD_REQUEST', errors);
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Not Found') {
    super(404, message, 'NOT_FOUND');
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message, 'CONFLICT');
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation Error', errors = []) {
    super(422, message, 'VALIDATION_ERROR', errors);
  }
}

class TooManyRequestsError extends ApiError {
  constructor(message = 'Too Many Requests') {
    super(429, message, 'TOO_MANY_REQUESTS');
  }
}

export {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
};
