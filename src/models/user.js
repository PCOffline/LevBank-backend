import mongoose from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';
import { compare, hash } from 'bcrypt';
import TransactionModel from './transaction.js';

const { Schema, model } = mongoose;

const UserSchema = new Schema({
  firstName: { type: Schema.Types.String, required: true },
  lastName: { type: Schema.Types.String, required: true },
  username: { type: Schema.Types.String, required: true, unique: true },
  passwordHash: { type: Schema.Types.String },
  type: { type: Schema.Types.String, enum: ['client', 'admin'], required: true, default: 'client' },
  isApproved: { type: Schema.Types.Boolean, required: true, default: false },
});

UserSchema.plugin(uniqueValidator);

UserSchema.methods.validPassword = function (password) {
  return compare(password, this.passwordHash);
};

UserSchema.virtual('password').set(async function (value) {
  this.passwordHash = await hash(value, 12);
  // Don't throw error in case of invalid values
  this.save().catch(() => {});
});

UserSchema.methods.getBalance = async function () {
  const transactions = await TransactionModel.find({
    $or: [
      { sender: this.username },
      { recipient: this.username },
    ],
  });

  return transactions.reduce((acc, curr) => {
    if (curr.sender === this.username) return acc - curr.amount;
    if (curr.recipient === this.username) return acc + curr.amount;

    return acc;
  }
  , 0);
};

UserSchema.methods.setBalance = async function (value) {
  if (value < 0) throw new Error('Balance cannot be negative');
  const balance = await this.getBalance();

  // Get previous block
  const [previousBlock] = await TransactionModel.find().sort({ $natural: -1 }).limit(1);

  // Create new transaction to modify the balance
  if (value < balance) return TransactionModel.create({ sender: this.username, recipient: null, amount: value - balance, prevHash: previousBlock?.hash ?? '0', type: 'transfer' });
  if (value > balance) return TransactionModel.create({ sender: null, recipient: this.username, amount: value - balance, prevHash: previousBlock?.hash ?? '0', type: 'transfer' });
  return null;
};

UserSchema.methods.getFilteredUser = async function () {
  return {
    firstName: this.firstName,
    lastName: this.lastName,
    username: this.username,
    type: this.type,
    balance: await this.getBalance(),
  };
};

const UserModel = model('User', UserSchema);

export default UserModel;

