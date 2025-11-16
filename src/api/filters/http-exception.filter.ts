import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const errorResponse = exception.getResponse();

    // Log the error
    this.logger.error(
      `HTTP Exception: ${status} - ${request.method} ${request.url}`,
      exception.stack,
    );

    // Create a standardized error response
    const errorObject = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: typeof errorResponse === 'string' ? errorResponse : (errorResponse as any).message || 'Internal server error',
    };

    // Add additional error details if available
    if (typeof errorResponse !== 'string' && (errorResponse as any).error) {
      errorObject['errorType'] = (errorResponse as any).error;
    }

    response.status(status).json(errorObject);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default to internal server error
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log the error
    this.logger.error(
      `Unhandled Exception: ${status} - ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // Create a standardized error response
    const errorObject: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: exception instanceof Error ? exception.message : 'Internal server error',
    };

    // For transaction-related errors, show the actual error message
    // This helps with debugging slippage and other transaction issues
    if (request.url.includes('/tokens/') && request.url.includes('/submit-signed')) {
      // Show detailed error for transaction submission
      errorObject.error = exception instanceof Error ? exception.message : 'Internal server error';
      errorObject.details = exception instanceof Error ? exception.stack : undefined;
    } else if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      // For other 500 errors, show message if it's a known transaction error
      const errorMessage = exception instanceof Error ? exception.message : 'Internal server error';
      if (errorMessage.includes('Slippage') || errorMessage.includes('transaction') || errorMessage.includes('Transaction')) {
        errorObject.error = errorMessage;
      } else {
        errorObject.error = 'Internal server error';
      }
    }

    response.status(status).json(errorObject);
  }
}
