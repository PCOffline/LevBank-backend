import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import userRouter from './routers/userRouter.js';
import authRouter from './routers/authRouter.js';
import financeRouter from './routers/financeRouter.js';
import chatRouter from './routers/chatRouter.js';
import alerterRouter from './routers/alerterRouter.js';
import mongoose from 'mongoose';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import expressSession from 'express-session';
import morgan from 'morgan';
import User from './models/user.js';
import flash from 'connect-flash';
import { v4 as uuid } from 'uuid';
import MongoStore from 'connect-mongo';
import expressWs from 'express-ws';
import './alerter.js';

const app = express();
expressWs(app);

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/levbank';
    mongoose
      .connect(mongoUrl)
      .catch((err) => console.error(`Mongoose Error: ${err.stack}`));

app.use(morgan('dev'));
app.use(cors({ origin: 'http://localhost:3000', optionsSuccessStatus: 200, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  expressSession({
    store: new MongoStore({
      mongoUrl,
      collection: 'sessions'
    }),
    genid: (req) => uuid(),
    resave: false,
    saveUninitialized: true,
    secret:
      process.env.SESSION_SEC || 'You must generate a random session secret',
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: false,
      // sameSite: 'none',
    },
  }),
);

app.use(flash());

passport.serializeUser((user, done) => {
  done(null, user.username);
});

passport.deserializeUser((username, done) => {
  User.findOne({ username }, (err, user) => {
    if (!user) done(err, false);
    else user.getFilteredUser()
    .then((filteredUser) => done(err, filteredUser))
    .catch((err) => done(err, false));
  });
});

const local = new LocalStrategy.Strategy((username, password, done) => {
  User.findOne({ username })
    .then(async (user) => {
      if (!user || !(await user.validPassword(password))) {
        done(null, false, { message: 'Invalid username/password' });
      } else if (!user.isApproved) {
        done(null, false, { message: 'Account not approved' });
      } else {
        user.getBalance()
        .then((balance) => done(null, { ...user.toObject(), balance }))
        .catch((err) => done(err, false));
      }
    })
    .catch((err) => done(err));
});

passport.use(local);

app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', authRouter());
app.use('/user', userRouter());
app.use('/finance', financeRouter());
app.use('/chat', chatRouter());
app.use('/alerter', alerterRouter());

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(8080, () => console.log('Up and running'));
