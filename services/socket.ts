import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../constants';

const getStoredToken = (): string => {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )clientify_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
};

class SocketService {
  private socket: Socket | null = null;
  private handlers: { [key: string]: ((...args: any[]) => void)[] } = {};

  connect() {
    const token = getStoredToken();

    if (this.socket) {
      if (!this.socket.connected) {
        if (token) {
          this.socket.auth = { token };
        }
        this.socket.connect();
      }
      return;
    }

    try {
      this.socket = io(SOCKET_URL, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        auth: token ? { token } : undefined,
      } as any);

      this.socket.on('connect', () => {
        console.debug('⚡ Unified Vault Sync Connected');
        if (token) {
          this.socket?.emit('authenticate', token);
        }
        this.trigger('connect', {});
      });

      this.socket.onAny((event, ...args) => {
        this.trigger(event, args[0]);
      });

      this.socket.on('db_item_change', (payload) => {
        console.debug('Real-time update received:', payload);
        window.dispatchEvent(new CustomEvent('clientify_db_change', { detail: payload }));
      });

      this.socket.on('disconnect', (reason) => {
        console.warn('🔌 Vault Sync Interrupted:', reason);
        this.trigger('disconnect', { reason });
      });

      // Reconnect automatically when returning to tab/window
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', () => {
          if (this.socket && !this.socket.connected) {
            this.socket.connect();
          }
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
            this.socket.connect();
          }
        });
      }
    } catch (e) {
      console.warn('Socket connection error. Real-time features may be limited.');
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(callback);
    this.socket?.on(event, callback);
  }

  off(event: string, callback: (data: any) => void) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter(cb => cb !== callback);
    }
    this.socket?.off(event, callback);
  }

  private trigger(event: string, data: any) {
    this.handlers[event]?.forEach(cb => cb(data));
  }

  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.debug(`[Sync Delayed] ${event}`, data);
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.handlers = {};
  }
}

export const socketService = new SocketService();
