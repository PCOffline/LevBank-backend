import express from 'express';
import axios from 'axios';
import { loggedInOnly } from '../middlewares.js';
import TransactionModel from '../models/transaction.js';
import UserModel from '../models/user.js';
import LoanRequestSchema from '../models/loanRequest.js';

const router = express.Router();

let usdToIls = { value: null, timestamp: null };

// Return all transactions of the user
router.get('/me', loggedInOnly, (req, res, next) => {
  TransactionModel.find({ $or: [{ recipient: req.user.username }, { sender: req.user.username }] } )
    .sort({ $natural: 1 })
    .then((transactions) => res.json(transactions))
    .catch((err) => next(err));
});

router.get('/exchange', async (req, res, next) => {
  // TODO: Calculate the value of LC based on amount of users
  const userCount = await UserModel.countDocuments({}).catch((err) => next(err));
  if (!usdToIls.timestamp || usdToIls.timestamp.getTime() <= new Date().getTime() - 10 * 60 * 1000) {
    const response = await axios.get('https://api.currencyapi.com/v3/latest', {
      params: {
        apikey: 'RyVeXnhGoPn9fIJ64iYQnUQmzCmifcCPBBcvMSz5',
        currencies: 'ILS',
      },
    }).catch((err) => next(err));

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

  if (!recipient || !await UserModel.findOne({ username: recipient })) {
    res.status(404).send(`Recipient ${recipient} not found`);
    return;
  }

  const prevBlock = await TransactionModel.findOne({}).sort({ $natural: -1 }).catch((err) => next(err));

  await TransactionModel.create({
    sender: req.user.username,
    prevHash: prevBlock?.hash ?? '',
    type: 'transfer',
    recipient,
    amount,
    description,
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(204);
});

router.post('/loan', loggedInOnly, async (req, res, next) => {
  const { amount, recipient } = req.body;

  if (amount < 0) {
    res.status(400).send("Amount can't be negative");
    return;
  }

  if (!recipient || !await UserModel.findOne({ username: recipient })) {
    res.status(404).send(`Recipient ${recipient} not found`);
    return;
  }

  const user = await UserModel.findOne({ username: req.user.username }).catch((err) => next(err));

  if (amount > (await user.getBalance()) / 2) {
    res.status(400).send('You can not loan more than half of your balance');
    return;
  }

  const request = await LoanRequestSchema.create({
    requester: req.user.username,
    requestee: recipient,
    type: 'loan',
    status: 'pending',
    amount,
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.json(request);

});

router.post('/lend', loggedInOnly, async (req, res, next) => {
  const { amount, recipient } = req.body;

  if (amount < 0) {
    res.status(400).send("Amount can't be negative");
    return;
  }

  const requester = await UserModel.findOne({ username: req.user.username }).catch((err) => next(err));
  const requestee = await UserModel.findOne({ username: recipient });

  if (!recipient || !requestee) {
    res.status(404).send(`Recipient ${recipient} not found`);
    return;
  }

  if (amount > (await requester.getBalance()) / 2) {
    res.status(400).send('You can not loan more than half of your balance');
    return;
  }

  if ((await requestee.getBalance()) * 0.6 < amount) {
    res.status(400).send("Requestee's balance does not meet the minimum requirements for a loan");
    return;
  }

  const prevBlock = await TransactionModel.findOne({}).sort({ $natural: -1 }).catch((err) => next(err));

  const transaction = await TransactionModel.create({
    amount,
    recipient,
    sender: req.user.username,
    type: 'lend',
    prevHash: prevBlock?.hash ?? '',
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(200).json(transaction);

});

router.post('/approve', loggedInOnly, async (req, res, next) => {
  const { transactionId } = req.body;

  const request = await LoanRequestSchema.findOneAndUpdate({ _id: transactionId }).catch((err) => next(err));

  if (!request) {
    res.status(404).send(`Transaction ${transactionId} not found`);
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).send(`Transaction ${transactionId} is not pending`);
    return;
  }

  if (request.requestee !== req.user.username) {
    res.status(400).send(`Transaction ${transactionId} is not for you`);
    return;
  }

  request.status = 'approved';
  await request.save().catch((err) => next(err));

  const prevBlock = await TransactionModel.findOne({}).sort({ $natural: -1 }).catch((err) => next(err));

  await TransactionModel.create({
    recipient: request.requester,
    sender: req.user.username,
    type: 'loan',
    amount: request.amount,
    prevHash: prevBlock?.hash ?? '',
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(204);
});

router.post('/reject', loggedInOnly, async (req, res, next) => {
  const { transactionId } = req.body;

  const request = await LoanRequestSchema.findOne({ _id: transactionId }).catch((err) => next(err));

  if (!request) {
    res.status(404).send(`Transaction ${transactionId} not found`);
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).send(`Transaction ${transactionId} is not pending`);
    return;
  }

  if (request.requestee !== req.user.username) {
    res.status(400).send(`Transaction ${transactionId} is not for you`);
    return;
  }

  request.status = 'rejected';
  await request.save().catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(204);
});

router.post('/repay', loggedInOnly, async (req, res, next) => {
  const { transactionId } = req.body;

  const request = await LoanRequestSchema.findOne({ _id: transactionId }).catch((err) => next(err));

  if (!request) {
    res.status(404).send(`Transaction ${transactionId} not found`);
    return;
  }

  if (request.status !== 'approved') {
    res.status(400).send(`Transaction ${transactionId} is not approved`);
    return;
  }

  if (request.requester !== req.user.username) {
    res.status(400).send(`Transaction ${transactionId} is not for you`);
    return;
  }

  request.status = 'repaid';
  await request.save().catch((err) => next(err));

  const prevBlock = await TransactionModel.findOne({}).sort({ $natural: -1 }).catch((err) => next(err));

  await TransactionModel.create({
    recipient: request.requestee,
    sender: req.user.username,
    type: 'repay',
    amount: request.amount,
    prevHash: prevBlock?.hash ?? '',
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(204);
});

// Withdraw a lend (i.e. take back the lend)
router.post('/withdraw', loggedInOnly, async (req, res, next) => {
  const { transactionId } = req.body;

  const request = await LoanRequestSchema.findOne({ _id: transactionId }).populate('requesterUser').catch((err) => next(err));

  if (!request) {
    res.status(404).send(`Transaction ${transactionId} not found`);
    return;
  }

  if (request.status !== 'approved') {
    res.status(400).send(`Transaction ${transactionId} is not approved`);
    return;
  }

  if (request.requestee !== req.user.username) {
    res.status(400).send(`Transaction ${transactionId} is not for you`);
    return;
  }

  if ((await request.requesterUser.getBalance()) * 0.6 >= request.amount) {
    res.status(400).send(`User ${request.requester} does not meet the minimum requirements for an immediate withdraw`);
    return;
  }

  request.status = 'repaid';
  await request.save().catch((err) => next(err));

  const prevBlock = await TransactionModel.findOne({}).sort({ $natural: -1 }).catch((err) => next(err));

  await TransactionModel.create({
    recipient: request.requester,
    sender: req.user.username,
    type: 'repay',
    amount: request.amount,
    prevHash: prevBlock?.hash ?? '',
  }).catch((err) => next(err));

  if (await TransactionModel.validateTransactions().catch((err) => next(err))) res.status(500).send('Blockchain is invalid');

  res.sendStatus(204);
});

export default router;
