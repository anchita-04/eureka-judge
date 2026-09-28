import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class JudgeServiceKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.JUDGE_EVENT_SECRET;
    if (!expected) throw new InternalServerErrorException('Judge event secret is not configured');

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-judge-secret');
    if (!provided) throw new UnauthorizedException('Invalid judge service credentials');

    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);
    if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
      throw new UnauthorizedException('Invalid judge service credentials');
    }
    return true;
  }
}
