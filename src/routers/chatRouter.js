import express from 'express';
import { loggedInOnly } from '../middlewares.js';
import ChatModel from '../models/chat.js';
import UserModel from '../models/user.js';

export default function setupRouter() {
  const router = express.Router();

  const clients = new Map();

  router.get('/history/:username', (req, res, next) => {
    const { username } = req.params;
    ChatModel.find({
      $or: [
        { sender: req.user.username, recipient: username },
        { sender: username, recipient: req.user.username },
      ],
    })
      .then((chats) => res.json(chats))
      .catch((err) => next(err));
  });

  router.ws(
    '/',
    (ws, req, next) => loggedInOnly(req, { ...ws, status: () => ws }, next),
    (ws, req) => {
      clients.set(req.user.username, ws);

      ws.on('message', async (msg) => {
        clients.set(req.user.username, ws);
        const { recipient, message } = JSON.parse(msg);

        if (recipient === req.user.username)
          return ws.send(JSON.stringify({
            error: true,
            message: 'You cannot send a message to yourself.',
          }));

        const recipientUser = await UserModel.findOne({ username: recipient });

        if (!recipientUser)
          return ws.send(JSON.stringify({ error: true, message: 'Recipient user not found' }));

        if (req.user.type !== 'admin' && recipientUser.type !== 'admin')
          return ws.send(JSON.stringify({
            error: true,
            message: 'You can only chat with an admin.',
          }));

        const chat = await ChatModel.create({
          recipient,
          message,
          sender: req.user.username,
          timestamp: new Date(),
        });

        ws.send(JSON.stringify(chat.toJSON()));
        const recipientSocket = clients.get(recipient);
        recipientSocket.send(JSON.stringify(chat.toJSON()));
      });

      ws.on('close', () => {
        clients.delete(req.user.username);
      });

      ws.on('error', (err) => {
        console.error(err);
      });
    },
  );

  return router;
}
