import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/socket';

class SocketService {
  private socket: Socket<
    ServerToClientEvents,
    ClientToServerEvents
> | null = null;
  private url: string = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  private connectionListeners: ((isConnected: boolean) => void)[] = [];
  private eventListeners = new Map<
    keyof ServerToClientEvents,
    Set<ServerToClientEvents[keyof ServerToClientEvents]>
  >();

  connect() {
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    this.socket = io(this.url, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });

    this.attachEventListeners();

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.notifyListeners(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.notifyListeners(false);
      if (reason === 'io server disconnect') {
        this.socket?.connect();
      }
    });

    this.socket.io.on('reconnect', (attemptNumber: number) => {
      console.log('Socket reconnected after attempt:', attemptNumber);
      this.notifyListeners(true);
      // Let the app know we reconnected so it can refetch REST state to heal missed events
      window.dispatchEvent(new CustomEvent('chat:reconnected'));
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      this.notifyListeners(false);
    });

    this.socket.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.notifyListeners(false);
    }
  }

  on<Ev extends keyof ServerToClientEvents>(
    event: Ev, 
    callback: ServerToClientEvents[Ev]
  ) {
    const listeners = this.eventListeners.get(event) ?? new Set();
    const listener = callback as ServerToClientEvents[keyof ServerToClientEvents];

    if (listeners.has(listener)) return;

    listeners.add(listener);
    this.eventListeners.set(event, listeners);

    if (this.socket) this.socket.on(event as never, callback as never);
  }

  off<Ev extends keyof ServerToClientEvents>(
    event: Ev, 
    callback?: ServerToClientEvents[Ev]
  ) {
    if (callback) {
      const listeners = this.eventListeners.get(event);
      listeners?.delete(callback as ServerToClientEvents[keyof ServerToClientEvents]);
      if (listeners?.size === 0) this.eventListeners.delete(event);
    } else {
      this.eventListeners.delete(event);
    }

    if (this.socket) this.socket.off(event as never, callback as never);
  }

  emit<Ev extends keyof ClientToServerEvents>(
    event: Ev, 
    ...args: Parameters<ClientToServerEvents[Ev]>
  ) {
    if (this.socket) {
      this.socket.emit(event, ...args);
    }
  }

  subscribeToConnectionState(listener: (isConnected: boolean) => void) {
    this.connectionListeners.push(listener);
    if (this.socket) {
      listener(this.socket.connected);
    }
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(isConnected: boolean) {
    this.connectionListeners.forEach(listener => listener(isConnected));
  }

  private attachEventListeners() {
    if (!this.socket) return;

    for (const [event, listeners] of this.eventListeners) {
      for (const listener of listeners) {
        this.socket.on(event, listener as never);
      }
    }
  }
}

export const socketService = new SocketService();
