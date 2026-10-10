import { Server } from 'socket.io';
import { verifyToken } from '../auth/jwt.js';

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.id) {
        socket.userId = decoded.id.toString();
        socket.user = decoded;
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      console.log(`⚡ Authenticated Practitioner Connected (${socket.userId}):`, socket.id);
    } else {
      console.log('⚡ Practitioner Connected (unauthenticated):', socket.id);
    }

    socket.on('authenticate', (token) => {
      if (token) {
        const decoded = verifyToken(token);
        if (decoded && decoded.id) {
          socket.userId = decoded.id.toString();
          socket.user = decoded;
          socket.join(`user_${socket.userId}`);
          console.log(`⚡ Socket authenticated post-connection (${socket.userId}):`, socket.id);
        }
      }
    });

    socket.on('message', (data) => {
      const targetRoom = socket.userId ? `user_${socket.userId}` : null;
      const msgPayload = {
        ...data,
        id: `msg_${Date.now()}`,
        sender: socket.user?.username || data.sender,
        timestamp: Date.now()
      };

      if (targetRoom) {
        io.to(targetRoom).emit('message', msgPayload);
      } else {
        socket.emit('message', msgPayload);
      }
    });

    socket.on('data_updated', () => {
      const targetRoom = socket.userId ? `user_${socket.userId}` : null;
      if (targetRoom) {
        socket.to(targetRoom).emit('sync_data');
        io.to(targetRoom).emit('db_item_change', { type: 'update' });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Practitioner Disconnected:', socket.id);
    });
  });

  return io;
}
