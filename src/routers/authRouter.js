import passport from 'passport';
import express from 'express';
import UserModel from '../models/user.js';
import { loggedOutOnly, loggedInOnly } from '../middlewares.js';
import { sendMailToAdmins } from '../alerter.js';

export default function setupRouter() {
  const router = express.Router();

  router.post('/login', loggedOutOnly, (req, res, next) => {
    passport.authenticate(
      'local',
      { passReqToCallback: true },
      (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(400).send(info.message);
        if (!user.isApproved)
          return res.status(400).send('Account is not approved');
        req.login(user, (err) => {
          if (err) return next(err);
          return res.json({
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            username: req.user.username,
            type: req.user.type,
            balance: req.user.balance,
          });
        });
      },
    )(req, res, next);
  });

  // TODO: Send mail to Admin
  router.post('/register', loggedOutOnly, (req, res, next) => {
    const { firstName, lastName, username, email, password } = req.body;

    const emailRegex =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegex.test(email)) return res.status(400).send('Invalid email');

    const usernameRegex = /^[a-z0-9_]{4,}$/;
    if (!usernameRegex.test(username)) return res.status(400).send('Invalid username');
    if (password.length < 8) return res.status(400).send('Password must be at least 8 characters');
    if (firstName.length < 2 || lastName.length < 2) return res.status(400).send('Name must be at least 2 characters');

    UserModel.create({
      firstName,
      lastName,
      username,
      password,
      email,
      type: 'client',
      isApproved: false,
    })
      .then((value) => res.status(201).json(value))
      .then(() =>
        sendMailToAdmins(
          `${firstName} ${lastName} has registered with the username ${username} and is awaiting approval`,
        ),
      )
      .catch((err) => {
        if (err.name === 'ValidationError') {
          res.status(400).send('Sorry, that username is already taken.');
        } else next(err);
      });
  });

  router.post('/logout', loggedInOnly, (req, res) => {
    req.session.destroy(() => res.sendStatus(204));
  });

  return router;
}
