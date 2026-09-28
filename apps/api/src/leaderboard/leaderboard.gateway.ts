import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN?.split(',') ?? false },
})
export class LeaderboardGateway implements OnGatewayInit {
  @WebSocketServer()
  private server?: Server;

  constructor(private readonly prisma: PrismaService) {}

  afterInit(): void {
    // Gateway initialization is managed by Nest; the server is assigned by its decorator.
  }

  @SubscribeMessage('leaderboard:subscribe')
  async subscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const contestId = this.readContestId(body);
    if (!contestId) {
      client.emit('leaderboard:error', { message: 'contestId must be a UUID' });
      return;
    }

    const contest = await this.prisma.contest.findUnique({
      where: { id: contestId },
      select: { visibility: true },
    });
    if (!contest || contest.visibility !== 'public') {
      client.emit('leaderboard:error', { message: 'Contest leaderboard is unavailable' });
      return;
    }

    await client.join(this.roomName(contestId));
    client.emit('leaderboard:subscribed', { contestId });
  }

  @SubscribeMessage('leaderboard:unsubscribe')
  async unsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const contestId = this.readContestId(body);
    if (contestId) await client.leave(this.roomName(contestId));
  }

  async announceVerdict(contestId: string): Promise<void> {
    if (!this.server) return;
    const contest = await this.prisma.contest.findUnique({
      where: { id: contestId },
      select: { freezeTime: true, endTime: true },
    });
    if (!contest) return;

    const now = new Date();
    const frozen = Boolean(contest.freezeTime && now >= contest.freezeTime && now < contest.endTime);
    if (frozen) return;

    this.server.to(this.roomName(contestId)).emit('leaderboard:refresh', {
      contestId,
      asOf: now.toISOString(),
    });
  }

  private readContestId(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const contestId = (body as Record<string, unknown>).contestId;
    return typeof contestId === 'string' && UUID_PATTERN.test(contestId) ? contestId : null;
  }

  private roomName(contestId: string): string {
    return `contest:${contestId}:leaderboard`;
  }
}
