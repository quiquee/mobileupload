class ValidationError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'ValidationError';
    this.meta = meta;
  }
}

function serializeError(err) {
  if (!err) return { message: 'Unknown error' };
  return {
    message: err.message,
    stack: err.stack,
    name: err.name
  };
}

module.exports = { ValidationError, serializeError };
