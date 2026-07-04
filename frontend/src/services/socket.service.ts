import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';

class SocketService {
  private socket: Socket | null = null;
  private url: string = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  private connectionListeners: ((isConnected: boolean) => void)[] = [];

  connect() {
    if (this.socket?.connected) return;
    
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    this.socket = io(this.url, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });

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

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after attempt:', attemptNumber);
      this.notifyListeners(true);
      // Let the app know we reconnected so it can refetch REST state to heal missed events
      window.dispatchEvent(new CustomEvent('chat:reconnected'));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.notifyListeners(false);
    }
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: unknown[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event: string, ...args: unknown[]) {
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
}

export const socketService = new SocketService();
