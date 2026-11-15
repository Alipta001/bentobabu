/**
 * Centralized Error Handling Middleware for Express 5
 */

const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Default error values
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || undefined;

  // 1. Handle Malformed JSON payload (SyntaxError from express.json())
  if (err instanceof SyntaxError && (err.status === 400 || statusCode === 400) && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON in request body';
    errors = undefined;
  }

  // 2. Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // 3. Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for unique field: ${field}`;
    errors = [{ field, message: `${field} already exists` }];
  }

  // 4. Handle Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for resource identifier`;
  }

  // 5. Handle Multer Errors (e.g. LIMIT_FILE_SIZE)
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum allowed limit (8 MB).';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded at once (maximum 4).';
    } else {
      message = err.message;
    }
  }

  // 6. Ensure CORS error is cleanly returned as 403
  if (message.includes('Not allowed by CORS')) {
    statusCode = 403;
  }

  const response = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(!isProduction && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found Middleware
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFoundHandler };

