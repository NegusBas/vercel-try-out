import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import OpenAI from 'openai';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory store for simplicity. In a real app, use a database.
const messages: { [room: string]: any[] } = {};
const userRoles: { [userId: string]: string } = {};

io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) {
    return next(new Error("Invalid user"));
  }
  (socket as any).userId = userId;
  next();
});

io.on('connection', (socket) => {
  const userId = (socket as any).userId;

  socket.on('join', (room) => {
    socket.join(room);
    if (!messages[room]) {
      messages[room] = [];
    }
    socket.emit('previous messages', messages[room]);
  });

  socket.on('chat message', async (data) => {
    const { room, message, publicKey } = data;
    const encryptedMessage = encryptMessage(message, publicKey);
    const newMessage = { userId, message: encryptedMessage, timestamp: Date.now() };
    messages[room].push(newMessage);
    io.to(room).emit('chat message', newMessage);

    // AI chatbot integration
    if (message.toLowerCase().includes('@ai')) {
      const aiResponse = await getAIResponse(message);
      const encryptedAIMessage = encryptMessage(aiResponse, publicKey);
      const aiMessage = { userId: 'AI', message: encryptedAIMessage, timestamp: Date.now() };
      messages[room].push(aiMessage);
      io.to(room).emit('chat message', aiMessage);
    }
  });

  socket.on('typing', (room) => {
    socket.to(room).emit('user typing', userId);
  });

  socket.on('stopped typing', (room) => {
    socket.to(room).emit('user stopped typing', userId);
  });

  socket.on('read receipt', ({ room, messageId }) => {
    io.to(room).emit('message read', { userId, messageId });
  });
});

function encryptMessage(message: string, publicKey: string): string {
  const buffer = Buffer.from(message, 'utf8');
  const encrypted = crypto.publicEncrypt(publicKey, buffer);
  return encrypted.toString('base64');
}

async function getAIResponse(message: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0].message.content || "I'm sorry, I couldn't process that request.";
}

// Admin routes
app.post('/admin/moderate', (req, res) => {
  // Implement message moderation logic
});

app.post('/admin/manage-users', (req, res) => {
  // Implement user management logic
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});