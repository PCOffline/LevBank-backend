import express from 'express';
import { adminOnly, loggedInOnly } from '../middlewares.js';
import TransactionModel from '../models/transaction.js';
import UserModel from '../models/user.js';
import LoanRequestModel from '../models/loanRequest.js';
import ChatModel from '../models/chat.js';

export default function setupRouter() {
  const router = express.Router();

  const reloadSession = (req, res, filteredUser, next) => {
    req.user = filteredUser;
    req.login(filteredUser, (err) => {
      if (err) {
        return next(err);
      }

      res.json(filteredUser);
    });
  }

  router.get('/', loggedInOnly, (req, res) => {
    if (req.user.type === 'admin')
      return UserModel.find()
        .then((users) =>
          Promise.all(users.map((user) => user.getFilteredUser())),
        )
        .then((users) => res.json(users))
        .catch((err) => next(err));

    // If not an admin, return only admin users for chat-purposes
    UserModel.find({ type: 'admin' })
      .then((users) => Promise.all(users.map((user) => user.getFilteredUser())))
      .then((users) => res.json(users))
      .catch((err) => next(err));
  });

  router.get('/me', loggedInOnly, (req, res) => {
    UserModel.findOne({ username: req.user.username })
      .then((user) => user.getFilteredUser())
      .then((user) => res.json(user));
  });

  router.put('/approve', adminOnly, (req, res, next) => {
    const { username } = req.body;
    UserModel.findOneAndUpdate(
      { username },
      { isApproved: true },
      { new: true },
    )
      .then((value) => value?.getFilteredUser())
      .then((value) => (value ? res.json(value) : res.sendStatus(404)))
      .catch((err) => next(err));
  });

  router.put('/', loggedInOnly, async (req, res, next) => {
    const { firstName, lastName, username, password } = req.body;
    const newUser = await UserModel.findOneAndUpdate(
      { username: req.user.username },
      { firstName, lastName, username, password },
      { new: true },
    ).catch((err) => next(err));

    if (!newUser) return res.sendStatus(404);

    if (newUser.username !== req.user.username) {
      await TransactionModel.updateMany(
        { sender: req.user.username },
        { sender: username },
      ).catch((err) => next(err));
      await TransactionModel.updateMany(
        { recipient: req.user.username },
        { recipient: username },
      ).catch((err) => next(err));
      await LoanRequestModel.updateMany(
        { recipient: req.user.username },
        { recipient: username },
      ).catch((err) => next(err));
      await LoanRequestModel.updateMany(
        { sender: req.user.username },
        { sender: username },
      ).catch((err) => next(err));
    }

    const filteredUser = await newUser.getFilteredUser();

    reloadSession(req, res, filteredUser, next);
  });

  router.put('/password', loggedInOnly, async (req, res, next) => {
    const { password } = req.body;

    if (password.length < 8)
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters long' });

    const user = await UserModel.findOne(
      { username: req.user.username },
    ).catch((err) => next(err));

    if (!user) return res.sendStatus(404);

    user.password = password;
    await user.save();

    const filteredUser = await user.getFilteredUser();

    reloadSession(req, res, filteredUser, next);
  });

  router.put('/:username', adminOnly, async (req, res, next) => {
    try {
      const { username } = req.params;
      const { firstName, lastName, newUsername, password, balance } = req.body;

      const userToUpdate = await UserModel.findOne({ username });
      if (!userToUpdate) return res.sendStatus(404);

      if (firstName) {
        if (firstName.length > 2) userToUpdate.firstName = firstName;
        else return res.status(400).send(`Invalid first name ${firstName}`);
      }

      if (lastName) {
        if (lastName.length > 2) userToUpdate.lastName = lastName;
        else return res.status(400).send(`Invalid last name ${lastName}`);
      }

      if (username) {
        if (/[a-z0-9_]{4,}/.test(username))
          userToUpdate.username = newUsername.toLowerCase();
        else return res.status(400).send(`Invalid username '${username}'`);
      }

      await userToUpdate
        .save()
        .catch((err) => res.status(400).send(err.message));

      if (password) {
        if (password.length > 8) userToUpdate.password = password;
        else return res.status(400).send(`Invalid password ${password}`);
      }

      if (userToUpdate.username !== username) {
        await TransactionModel.updateMany(
          { sender: username },
          { sender: newUsername },
        );
        await TransactionModel.updateMany(
          { recipient: username },
          { recipient: newUsername },
        );
        await LoanRequestModel.updateMany(
          { recipient: username },
          { recipient: newUsername },
        );
        await LoanRequestModel.updateMany(
          { sender: username },
          { sender: newUsername },
        );
      }

      if (Number.isNaN(+balance) || +balance < 0)
        return res.status(400).send(`Invalid balance ${balance}`);
      else if (+balance !== (await userToUpdate.getBalance()))
        await userToUpdate.setBalance(balance);

      const filteredUser = await userToUpdate.getFilteredUser();

      reloadSession(req, res, filteredUser, next);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:username', adminOnly, (req, res, next) => {
    const { username } = req.params;
    UserModel.findOneAndDelete({ username })
      .then((value) => value?.getFilteredUser())
      .then((value) => (value ? res.json(value) : res.sendStatus(404)))
      .catch((err) => next(err));
  });

  router.put('/promote', adminOnly, (req, res, next) => {
    const { username } = req.body;
    UserModel.findOneAndUpdate({ username }, { type: 'admin' }, { new: true })
      .then((value) => value?.getFilteredUser())
      .then((value) => (value ? res.json(value) : res.sendStatus(404)))
      .catch((err) => next(err));
  });

  router.get('/requests', adminOnly, (req, res, next) => {
    UserModel.find({ isApproved: false })
      .then((users) => Promise.all(users.map((user) => user.getFilteredUser())))
      .then((users) => res.json(users))
      .catch((err) => next(err));
  });

  return router;
}
