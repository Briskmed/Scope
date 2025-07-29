import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

// Custom error class for application errors
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handling middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  // Default to 500 if status code is not set
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'statusCode' in err ? err.code : 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      ...('details' in err && { details: err.details }),
    },
  };

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development' && 'stack' in err) {
    response.error = {
      code: response.error?.code || 'INTERNAL_ERROR',
      message: response.error?.message || 'An unexpected error occurred',
      ...response.error,
      stack: err.stack
    };
  }

  res.status(statusCode).json(response);
};

// 404 Not Found handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
};

// Async handler wrapper to catch async/await errors
export const asyncHandler = (fn: Function) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
