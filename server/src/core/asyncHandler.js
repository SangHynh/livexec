/**
 * Wrapper for async express routes to catch errors and pass them to next()
 */
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
