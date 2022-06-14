import express from 'express';
import { adminOnly, loggedInOnly } from '../middlewares.js';
import TransactionModel from '../models/transaction.js';
import UserModel from '../models/user.js';
import LoanRequestModel from '../models/loanRequest.js';

const router = express.Router();

router.get('/', adminOnly, (req, res) => {
  UserModel.find()
  .then((users) => Promise.all(users.map((user) => user.getFilteredUser())))
  .then((users) => res.json(users));
});

router.get('/me', loggedInOnly, (req, res) => {
  UserModel.findOne({ username: req.user.username })
  .then((user) => user.getFilteredUser())
  .then((user) => res.json(user));
});

router.put('/approve', adminOnly, (req, res, next) => {
  const { username } = req.body;
  UserModel.findOneAndUpdate({ username }, { isApproved: true }, { new: true })
    .then((value) => value.getFilteredUser())
    .then((value) => value ? res.json(value) : res.sendStatus(404))
    .catch((err) => next(err));
  }
);

router.put('/', loggedInOnly, async (req, res, next) => {
  const { firstName, lastName, username, password } = req.body;
  const newUser = await UserModel.findOneAndUpdate({ username: req.user.username }, { firstName, lastName, username, password }, { new: true })
    .catch((err) => next(err));

    if (!newUser) res.sendStatus(404);

    if (newUser.username !== req.user.username) {
      await TransactionModel.updateMany({ sender: req.user.username }, { sender: username }).catch((err) => next(err));
      await TransactionModel.updateMany({ recipient: req.user.username }, { recipient: username }).catch((err) => next(err));
      await LoanRequestModel.updateMany({ requester: req.user.username }, { requester: username }).catch((err) => next(err));
      await LoanRequestModel.updateMany({ requestee: req.user.username }, { requestee: username }).catch((err) => next(err));
    }

    res.status(201).json(await newUser.getFilteredUser());
  }
);

router.put('/:username', adminOnly, async (req, res, next) => {
  try {
    const { username } = req.params;
    const { firstName, lastName, newUsername, password, balance } = req.body;

    const userToUpdate = await UserModel.findOne({ username });
    if (!userToUpdate) res.sendStatus(404);

    if (firstName) {
      if (firstName.length > 2)
        userToUpdate.firstName = firstName;
      else res.status(400).send(`Invalid first name ${firstName}`)
    }

    if (lastName) {
      if (lastName.length > 2)
        userToUpdate.lastName = lastName;
      else res.status(400).send(`Invalid last name ${lastName}`)
    }

    if (username) {
      if (/[a-z0-9_]{4,}/.test(username))
        userToUpdate.username = newUsername.toLowerCase();
      else res.status(400).send(`Invalid username '${username}'`);
    }

    await userToUpdate.save().catch((err) => res.status(400).send(err.message));

    if (password) {
      if (password.length > 8)
        userToUpdate.password = password;
      else res.status(400).send(`Invalid password ${password}`);
    }

    if (Number.isNaN(+balance) || +balance < 0) res.status(400).send(`Invalid balance ${balance}`)
    else if (+balance !== (await userToUpdate.getBalance())) await userToUpdate.setBalance(balance);

    if (userToUpdate.username !== username) {
      await TransactionModel.updateMany({ sender: username }, { sender: newUsername });
      await TransactionModel.updateMany({ recipient: username }, { recipient: newUsername });
      await LoanRequestModel.updateMany({ requester: username }, { requester: newUsername });
      await LoanRequestModel.updateMany({ requestee: username }, { requestee: newUsername });
    }

    res.status(201).json(await userToUpdate.getFilteredUser());
  } catch (err) {
    next(err);
  }
});

router.delete('/:username', adminOnly, (req, res, next) => {
  const { username } = req.params;
  UserModel.findOneAndDelete({ username })
    .then((value) => value.getFilteredUser())
    .then((value) => (value ? res.json(value) : res.sendStatus(404)))
    .catch((err) => next(err));
});

router.put('/promote', adminOnly, (req, res, next) => {
  const { username } = req.body;
  UserModel.findOneAndUpdate({ username }, { type: 'admin' }, { new: true })
    .then((value) => value.getFilteredUser())
    .then((value) => (value ? res.json(value) : res.sendStatus(404)))
    .catch((err) => next(err));
});

router.get('/requests', adminOnly, (req, res, next) => {
  UserModel.find({ isApproved: false })
    .then((users) => Promise.all(users.map((user) => user.getFilteredUser())))
    .then((users) => res.json(users))
    .catch((err) => next(err));
});

export default router;
