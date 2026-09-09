import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { isPaperArenaInput, PAPER_ARENA_PROTOCOL_VERSION, PAPER_ARENA_MAP_VERSION } from '@stealth-reader/shared';
import { PaperArenaService, paperArenaEnabled, type PaperPrincipal } from './paper-arena.service';

interface Connection {
  id: string; principal: PaperPrincipal | null; authenticating: boolean; deadline: NodeJS.Timeout;
  frameCount: number; windowAt: number; alive: boolean; validatedUntil: number; lastSnapshotAt: number;
}
/** Dedicated authenticated socket, deliberately independent from chat bandwidth. */
@Injectable()
export class PaperArenaGateway implements OnModuleDestroy {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  private readonly connections = new Map<WebSocket, Connection>();
  private http: Server | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private checking = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly arena: PaperArenaService) {
    this.server.on('connection', socket => this.accept(socket));
    this.unsubscribe = arena.subscribe(() => this.broadcast());
  }
  attach(http: Server): void {
    if (this.http === http) return;
    if (this.http) throw new Error('Paper arena is already attached');
    this.http = http; http.on('upgrade', this.upgrade);
    this.heartbeat = setInterval(() => void this.checkPrincipals(), 2000); this.heartbeat.unref?.();
  }
  async onModuleDestroy(): Promise<void> {
    this.unsubscribe(); if (this.heartbeat) clearInterval(this.heartbeat);
    this.http?.off('upgrade', this.upgrade); this.http = null;
    for (const [socket, state] of this.connections) { clearTimeout(state.deadline); socket.terminate(); }
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }
  private readonly upgrade = (request: IncomingMessage, socket: Socket, head: Buffer): void => {
    let url: URL; try { url = new URL(request.url ?? '', 'http://paper.invalid'); } catch { return; }
    if (url.pathname !== '/ws/paper-arena') return; // Other gateways own their own exact path.
    const reject = (status: number) => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (url.search || !paperArenaEnabled()) return reject(404);
    if (!this.allowedOrigin(request.headers.origin)) return reject(403);
    if (this.connections.size >= 224) return reject(503);
    this.server.handleUpgrade(request, socket, head, client => this.server.emit('connection', client, request));
  };
  private allowedOrigin(raw: string | undefined): boolean {
    if (!raw) return false;
    try {
      if (process.env.PUBLIC_SITE_ORIGIN && new URL(process.env.PUBLIC_SITE_ORIGIN).origin === raw) return true;
      if (process.env.LOCAL_DEV === 'true' && process.env.PAPER_ARENA_LOCAL_ORIGIN_RELAXED === 'true') {
        const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === raw;
      }
    } catch { /* malformed origin is never accepted */ }
    return false;
  }
  private accept(socket: WebSocket): void {
    const deadline = setTimeout(() => socket.close(4401, 'Authentication required'), 5000); deadline.unref?.();
    const state: Connection = { id: randomUUID(), principal: null, authenticating: false, deadline, frameCount: 0, windowAt: Date.now(), alive: true, validatedUntil: 0, lastSnapshotAt: 0 };
    this.connections.set(socket, state);
    socket.on('message', (data, binary) => { void this.frame(socket, state, data, binary); });
    socket.on('pong', () => { state.alive = true; });
    socket.on('error', () => { /* no frame/ticket data in logs */ });
    socket.on('close', () => { clearTimeout(state.deadline); this.connections.delete(socket); if (state.principal) this.arena.disconnect(state.principal, state.id); });
  }
  private async frame(socket: WebSocket, state: Connection, data: RawData, binary: boolean): Promise<void> {
    const now = Date.now();
    if (now - state.windowAt >= 1000) { state.frameCount = 0; state.windowAt = now; }
    if (binary || ++state.frameCount > 45) { socket.close(binary ? 4400 : 4429, 'Invalid frame or rate'); return; }
    let frame: Record<string, unknown>;
    try {
      const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      frame = value as Record<string, unknown>;
    } catch { socket.close(4400, 'Invalid JSON'); return; }
    try {
      if (!state.principal) {
        if (state.authenticating || frame.type !== 'paper.authenticate' || Object.keys(frame).length !== 3) { socket.close(4401, 'Authentication required'); return; }
        if (frame.protocolVersion !== PAPER_ARENA_PROTOCOL_VERSION) {
          this.send(socket, { type: 'paper.error', code: 'PAPER_PROTOCOL_UPGRADE_REQUIRED', message: '联机场景与武器已更新，请刷新页面后重新加入。', requiredProtocolVersion: PAPER_ARENA_PROTOCOL_VERSION, mapVersion: PAPER_ARENA_MAP_VERSION });
          socket.close(4406, 'Refresh required: protocol v2'); return;
        }
        state.authenticating = true;
        const principal = await this.arena.consumeTicket(frame.ticket);
        if (socket.readyState !== WebSocket.OPEN || this.connections.get(socket) !== state) return;
        // One account controls exactly one live seat. A new valid connection
        // replaces the old one; its eventual close cannot disconnect the new one.
        for (const [other, previous] of this.connections) if (other !== socket && previous.principal?.userId === principal.userId) other.close(4409, 'Reconnected elsewhere');
        this.arena.connect(principal, state.id); state.principal = principal; state.validatedUntil = Date.now() + 5000;
        clearTimeout(state.deadline);
        this.send(socket, { type: 'paper.authenticated', protocolVersion: PAPER_ARENA_PROTOCOL_VERSION, mapVersion: PAPER_ARENA_MAP_VERSION, playerId: this.arena.view(principal.userId, principal.roomId).myPlayerId });
        this.send(socket, { type: 'paper.snapshot', room: this.arena.view(principal.userId, principal.roomId) });
        return;
      }
      if (state.validatedUntil <= now) { socket.close(4401, 'Session validation expired'); return; }
      const { type, ...input } = frame;
      if (type !== 'paper.input' || !isPaperArenaInput(input)) { socket.close(4400, 'Invalid input'); return; }
      this.arena.input(state.principal, state.id, input);
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null;
      const payload = response && typeof response === 'object' ? response as Record<string, unknown> : {};
      this.send(socket, { type: 'paper.error', code: typeof payload.code === 'string' ? payload.code : 'PAPER_UNAVAILABLE', message: typeof payload.message === 'string' ? payload.message : '连接已中断，请重新加入房间。' });
      socket.close(4401, 'Connection rejected');
    } finally { state.authenticating = false; }
  }
  private send(socket: WebSocket, value: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) { socket.close(4429, 'Slow consumer'); return; }
    socket.send(JSON.stringify(value), error => { if (error) socket.terminate(); });
  }
  private broadcast(): void {
    const now = Date.now();
    for (const [socket, state] of this.connections) {
      if (!state.principal || state.validatedUntil <= now || now - state.lastSnapshotAt < 100) continue;
      try { this.send(socket, { type: 'paper.snapshot', room: this.arena.view(state.principal.userId, state.principal.roomId) }); state.lastSnapshotAt = now; }
      catch { socket.close(4404, 'Room ended'); }
    }
  }
  private async checkPrincipals(): Promise<void> {
    if (this.checking) return; this.checking = true;
    const entries = [...this.connections.entries()].filter(([socket, state]) => socket.readyState === WebSocket.OPEN && state.principal);
    try {
      await this.arena.pruneInactiveMembers();
      const valid = await this.arena.validPrincipals(entries.map(([, state]) => state.principal!));
      for (const [socket, state] of entries) {
        if (this.connections.get(socket) !== state || socket.readyState !== WebSocket.OPEN) continue;
        if (!this.arena.isCurrentConnection(state.principal!, state.id)) { socket.close(4401, 'Connection replaced or room ended'); continue; }
        if (!valid.has(state.principal!.sessionId)) { this.arena.revoke(state.principal!, state.id); socket.close(4401, 'Session revoked'); continue; }
        if (!state.alive) { socket.terminate(); continue; }
        state.alive = false; state.validatedUntil = Date.now() + 5000; socket.ping();
      }
    } catch { for (const [socket] of entries) socket.close(1013, 'Session service unavailable'); }
    finally { this.checking = false; }
  }
}
