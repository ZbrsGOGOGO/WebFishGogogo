import { HttpException } from '@nestjs/common';

export class ChatException extends HttpException {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(
      {
        code,
        message: publicMessage,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      },
      status,
    );
  }
}

export function chatException(
  code: string,
  message: string,
  status = 400,
  retryAfterSeconds?: number,
): ChatException {
  return new ChatException(code, message, status, retryAfterSeconds);
}
