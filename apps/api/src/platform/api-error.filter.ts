import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException
      ? exception.message
      : 'An unexpected error occurred';

    response.status(status).json({
      error: {
        code: this.codeForStatus(status),
        message,
        details: { path: request.url },
      },
    });
  }

  private codeForStatus(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return 'INVALID_REQUEST';
    if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
    if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
    if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
    return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}
