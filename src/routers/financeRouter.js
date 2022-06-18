import express from 'express';
import axios from 'axios';
import { loggedInOnly } from '../middlewares.js';
import TransactionModel from '../models/transaction.js';
import UserModel from '../models/user.js';
import LoanRequestSchema from '../models/loanRequest.js';

export default function setupRouter() {
  const router = express.Router();

  let usdToIls = { value: null, timestamp: null };

  // Return all transactions of the user
  router.get('/me', loggedInOnly, (req, res, next) => {
    TransactionModel.find({
      $or: [{ recipient: req.user.username }, { sender: req.user.username }],
    })
      .sort({ $natural: 1 })
      .then((transactions) => res.json(transactions))
      .catch((err) => next(err));
  });

  router.get('/me/requests', loggedInOnly, (req, res, next) => {
    LoanRequestSchema.find({
      $or: [{ recipient: req.user.username }, { sender: req.user.username }],
    }).then((requests) => res.json(requests));
  });

  router.get('/exchange', async (req, res, next) => {
    // TODO: Calculate the value of LC based on amount of users
    const userCount = await UserModel.countDocuments({}).catch((err) =>
      next(err),
    );
    if (
      !usdToIls.timestamp ||
      usdToIls.timestamp.getTime() <= new Date().getTime() - 60 * 60 * 1000
    ) {
      const response = await axios
        .get('https://api.currencyapi.com/v3/latest', {
          params: {
            apikey: 'RyVeXnhGoPn9fIJ64iYQnUQmzCmifcCPBBcvMSz5',
            currencies: 'ILS',
          },
        })
        .catch((err) => next(err));

      usdToIls = {
        value: response?.data.data.ILS.value,
        timestamp: new Date(),
      };
    }

    res.json({ lc: 1 + (userCount - 1) * 0.01, ils: usdToIls.value });
  });

  router.post('/transfer', loggedInOnly, async (req, res, next) => {
    const { recipient, amount, description } = req.body;

    if (amount < 0) {
      res.status(400).send("Amount can't be negative");
      return;
    }

    if (!recipient || !(await UserModel.findOne({ username: recipient }))) {
      res.status(404).send(`Recipient ${recipient} not found`);
      return;
    }

    if (recipient === req.user.username) {
      res.status(400).send('You cannot transfer money to yourself');
      return;
    }

    const prevBlock = await TransactionModel.findOne({})
      .sort({ $natural: -1 })
      .catch((err) => next(err));

    await TransactionModel.create({
      sender: req.user.username,
      prevHash: prevBlock?.hash ?? '',
      type: 'transfer',
      recipient,
      amount,
      description,
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.sendStatus(204);
  });

  router.post('/loan', loggedInOnly, async (req, res, next) => {
    const {
      amount,
      recipient: senderUsername,
      expiryDate,
      description,
    } = req.body;

    if (amount < 0) {
      res.status(400).send("Amount can't be negative");
      return;
    }

    if (new Date(expiryDate) < new Date()) {
      res.status(400).send('Expiry date must be in the future');
      return;
    }

    const maxExpiryDate = new Date();
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 30);

    if (new Date(expiryDate) < maxExpiryDate) {
      res
        .status(400)
        .send('Expiry date must be not more than 60 days from today');
      return;
    }

    if (senderUsername === req.user.username) {
      res.status(400).send('You cannot loan money from yourself');
      return;
    }

    const recipient = await UserModel.findOne({
      username: req.user.username,
    }).catch((err) => next(err));
    const sender = await UserModel.findOne({ username: senderUsername }).catch(
      (err) => next(err),
    );

    if (!sender) {
      res.status(404).send(`Recipient ${recipient} not found`);
      return;
    }

    if (amount > (await recipient.getBalance()) * 0.6) {
      res.status(400).send('You can not loan more than 60% of your balance');
      return;
    }

    if ((await sender.getBalance()) / 2 < amount) {
      res
        .status(400)
        .send(
          "Sender's balance does not meet the minimum requirements for a loan",
        );
      return;
    }

    const request = await LoanRequestSchema.create({
      recipient: req.user.username,
      sender: senderUsername,
      status: 'pending',
      amount,
      description,
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.json(request);
  });

  router.post('/lend', loggedInOnly, async (req, res, next) => {
    const {
      amount,
      recipient: recipientUsername,
      expiryDate,
      description,
    } = req.body;

    if (amount < 0) {
      res.status(400).send("Amount can't be negative");
      return;
    }

    if (new Date(expiryDate) < new Date()) {
      res.status(400).send('Expiry date must be in the future');
      return;
    }

    const maxExpiryDate = new Date();
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 30);

    if (new Date(expiryDate) < maxExpiryDate) {
      res
        .status(400)
        .send('Expiry date must be not more than 60 days from today');
      return;
    }

    const recipient = await UserModel.findOne({
      username: recipientUsername,
    }).catch((err) => next(err));
    const sender = await UserModel.findOne({ username: req.user.username });

    if (!recipient || !sender) {
      res.status(404).send(`Recipient ${recipient} not found`);
      return;
    }

    if (recipient === req.user.username) {
      res.status(400).send('You cannot lend money to yourself');
      return;
    }

    if (amount > (await recipient.getBalance()) / 2) {
      res.status(400).send('You can not lend more than half of your balance');
      return;
    }

    if ((await sender.getBalance()) * 0.6 < amount) {
      res
        .status(400)
        .send(
          "Recipient's balance does not meet the minimum requirements for a loan",
        );
      return;
    }

    const prevBlock = await TransactionModel.findOne({})
      .sort({ $natural: -1 })
      .catch((err) => next(err));

    await LoanRequestSchema.create({
      recipient: recipientUsername,
      sender: req.user.username,
      status: 'approved',
      amount,
      description,
    }).catch((err) => next(err));

    const transaction = await TransactionModel.create({
      amount,
      recipient: recipientUsername,
      description,
      sender: req.user.username,
      type: 'loan',
      prevHash: prevBlock?.hash ?? '',
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.json(transaction);
  });

  router.post('/approve', loggedInOnly, async (req, res, next) => {
    const { transactionId } = req.body;

    const request = await LoanRequestSchema.findOne({
      _id: transactionId,
    }).catch((err) => next(err));

    if (!request) {
      res.status(404).send(`Transaction ${transactionId} not found`);
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).send(`Transaction ${transactionId} is not pending`);
      return;
    }

    if (request.sender !== req.user.username) {
      res.status(400).send(`Transaction ${transactionId} is not for you`);
      return;
    }

    if (new Date(request.expiryDate) < new Date()) {
      res.status(400).send(`Transaction ${transactionId} has expired`);
      return;
    }

    const maxExpiryDate = new Date();
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 30);

    if (new Date(request.expiryDate) < maxExpiryDate) {
      res.status(400).send(`Transaction ${transactionId} has expired`);
      return;
    }

    request.status = 'approved';
    await request.save().catch((err) => next(err));

    const prevBlock = await TransactionModel.findOne({})
      .sort({ $natural: -1 })
      .catch((err) => next(err));

    await TransactionModel.create({
      recipient: request.recipient,
      sender: req.user.username,
      type: 'loan',
      amount: request.amount,
      description: request.description,
      prevHash: prevBlock?.hash ?? '',
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.sendStatus(204);
  });

  router.post('/reject', loggedInOnly, async (req, res, next) => {
    const { transactionId } = req.body;

    const request = await LoanRequestSchema.findOne({
      _id: transactionId,
    }).catch((err) => next(err));

    if (!request) {
      res.status(404).send(`Transaction ${transactionId} not found`);
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).send(`Transaction ${transactionId} is not pending`);
      return;
    }

    if (request.sender !== req.user.username) {
      res.status(400).send(`Transaction ${transactionId} is not for you`);
      return;
    }

    if (new Date(request.expiryDate) < new Date()) {
      res.status(400).send(`Transaction ${transactionId} has expired`);
      return;
    }

    request.status = 'rejected';
    await request.save().catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.sendStatus(204);
  });

  router.post('/repay', loggedInOnly, async (req, res, next) => {
    const { transactionId } = req.body;

    const request = await LoanRequestSchema.findOne({
      _id: transactionId,
    }).catch((err) => next(err));

    if (!request) {
      res.status(404).send(`Transaction ${transactionId} not found`);
      return;
    }

    if (request.status !== 'approved' && request.status !== 'invalid') {
      res.status(400).send(`Transaction ${transactionId} is not approved`);
      return;
    }

    if (request.recipient !== req.user.username) {
      res.status(400).send(`Transaction ${transactionId} is not for you`);
      return;
    }

    request.status = 'repaid';
    await request.save().catch((err) => next(err));

    const prevBlock = await TransactionModel.findOne({})
      .sort({ $natural: -1 })
      .catch((err) => next(err));

    await TransactionModel.create({
      recipient: request.sender,
      sender: req.user.username,
      type: 'repay',
      amount: request.amount,
      description: `Repay ${request.description}`,
      prevHash: prevBlock?.hash ?? '',
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.json(request);
  });

  // Withdraw a lend (i.e. take back the lend)
  router.post('/withdraw', loggedInOnly, async (req, res, next) => {
    const { transactionId } = req.body;

    const request = await LoanRequestSchema.findOne({ _id: transactionId })
      .populate('recipientUser')
      .catch((err) => next(err));

    if (!request) {
      res.status(404).send(`Transaction ${transactionId} not found`);
      return;
    }

    if (request.status !== 'approved' && request.status !== 'invalid') {
      res.status(400).send(`Transaction ${transactionId} is not approved`);
      return;
    }

    if (request.sender !== req.user.username) {
      res.status(400).send(`Transaction ${transactionId} is not for you`);
      return;
    }

    if ((await request.recipientUser.getBalance()) * 0.6 >= request.amount) {
      res
        .status(400)
        .send(
          `User ${request.recipient} does not meet the minimum requirements for an immediate withdraw`,
        );
      return;
    }

    request.status = 'repaid';
    await request.save().catch((err) => next(err));

    const prevBlock = await TransactionModel.findOne({})
      .sort({ $natural: -1 })
      .catch((err) => next(err));

    await TransactionModel.create({
      recipient: request.recipient,
      sender: req.user.username,
      type: 'repay',
      description: `Withdraw ${request.description}`,
      amount: request.amount,
      prevHash: prevBlock?.hash ?? '',
    }).catch((err) => next(err));

    if (await TransactionModel.validateTransactions().catch((err) => next(err)))
      return res.status(500).send('Blockchain is invalid');

    res.json(request);
  });

  return router;
}
