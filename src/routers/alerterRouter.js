import express from 'express';
import { adminOnly } from '../middlewares.js';
import { getInvalidLoans, getZeroBalanceUsers } from '../alerter.js';

function setupRotuer() {
  const router = express.Router();
  const clients = new Map();

  router.ws(
    '/',
    (ws, req, next) => adminOnly(req, { ...ws, status: () => ws }, next),
    (ws, req) => {
      clients.set(req.user.username, ws);

      ws.on('message', async () => {
        clients.set(req.user.username, ws);
      });

      const formatInvalidLoan = (invalidLoan) =>
        `Loan with ID ${invalidLoan.id} requested by ${
          invalidLoan.requester
        } to ${invalidLoan.requestee} on ${new Date(
          invalidLoan.timestamp,
        ).toLocaleDateString()} is ${
          new Date(invalidLoan.expiryDate) < new Date() ? 'expired' : 'invalid'
        }.`;

      const formatZeroBalanceUser = (zeroBalanceUser) => `${zeroBalanceUser.username} has 0 LC in their account.`;

      setInterval(async () => {
        const invalidLoans = await getInvalidLoans();
        const zeroBalanceUsers = await getZeroBalanceUsers();
        clients.forEach((socket) =>
          socket.send(
            JSON.stringify(
              invalidLoans
                .map(formatInvalidLoan)
                .concat(zeroBalanceUsers.map(formatZeroBalanceUser)),
            ),
          ),
        );
      }, 1000);

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

export default setupRotuer;
