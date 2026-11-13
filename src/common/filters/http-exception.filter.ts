import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const message = isHttp ? exception.getResponse() : 'Error interno del servidor'

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Error no controlado: ${
          exception instanceof Error ? exception.message : 'Error desconocido'
        }`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Error HTTP ${status}: ${JSON.stringify(message)}`,
      )
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: typeof message === 'object' ? message : { message },
    })
  }
}
