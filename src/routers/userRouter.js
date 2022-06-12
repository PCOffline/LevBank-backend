import express from 'express';
import { adminOnly, loggedInOnly } from '../middlewares.js';
import UserModel from '../models/user.js';

const router = express.Router();

router.get('/', adminOnly, (req, res) => {
  res.json(UserModel.find());
});

router.get('/me', loggedInOnly, (req, res) => {
  UserModel.findOne({ username: req.user.username })
  .then((user) => user.getFilteredUser())
  .then((user) => res.json(user));
});

router.put('/approve', adminOnly, (req, res, next) => {
  const { username } = req.body;
  UserModel.findOneAndUpdate({ username }, { isApproved: true }, { new: true })
    .then((value) => value ? res.json(value) : res.sendStatus(404))
    .catch((err) => next(err));
  }
  // TODO: Increase LC Value by $0.01
);

router.put('/', loggedInOnly, (req, res, next) => {
  const { firstName, lastName, username, password } = req.body;
  UserModel.findOneAndUpdate({ username: req.user.username }, { firstName, lastName, newUsername: username, password }, { new: true })
    .then((value) => value ? res.json(value) : res.sendStatus(404))
    .catch((err) => next(err));
  }
);

router.put('/:username', adminOnly, (req, res, next) => {
  const { firstName, lastName, username, password, balance } = req.body;
  UserModel.findOneAndUpdate({ username }, { firstName, lastName, username, password, balance }, { new: true })
    .then((value) => value ? res.json(value) : res.sendStatus(404))
    .catch((err) => next(err));
});

router.delete('/:username', adminOnly, (req, res, next) => {
  const { username } = req.params;
  UserModel.findOneAndDelete({ username })
    .then((value) => (value ? res.json(value) : res.sendStatus(404)))
    .catch((err) => next(err));
});

router.put('/promote', adminOnly, (req, res, next) => {
  const { username } = req.body;
  UserModel.findOneAndUpdate({ username }, { type: 'admin' }, { new: true })
    .then((value) => (value ? res.json(value) : res.sendStatus(404)))
    .catch((err) => next(err));
});

export default router;
