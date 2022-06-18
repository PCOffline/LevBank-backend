import passport from 'passport';
import express from 'express';
import UserModel from '../models/user.js';
import { loggedOutOnly, loggedInOnly } from '../middlewares.js';
import { sendMailToAdmins } from 'c:/users/beker/desktop/react-backend/src/alerter.js';

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
    const { firstName, lastName, username, password } = req.body;
    UserModel.create({
      firstName,
      lastName,
      username,
      password,
      type: 'client',
      isApproved: false,
    })
      .then((value) => res.status(201).json(value))
      .then(() => sendMailToAdmins(`${firstName} ${lastName} has registered with the username ${username} and is awaiting approval`))
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
