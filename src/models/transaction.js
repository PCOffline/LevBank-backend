import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const TransactionSchema = new Schema(
  {
    sender: { type: Schema.Types.String, required: true },
    recipient: { type: Schema.Types.String, required: true },
    amount: { type: Schema.Types.Number, required: true },
    type: { type: Schema.Types.String, enum: ['loan', 'transfer', 'repay'], required: true },
    timestamp: { type: Schema.Types.Date, default: new Date(), required: true },
    prevHash: { type: Schema.Types.String, required: true },
  },
  {
    toObject: { virtuals: true },
  },
);

TransactionSchema.virtual('senderUser', {
  ref: 'User',
  localField: 'sender',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

TransactionSchema.virtual('recipientUser', {
  ref: 'User',
  localField: 'recipient',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

TransactionSchema.virtual('hash').get(function () {
  return crypto
    .createHash('sha256')
    .update(this._id + this.recipient + this.sender + this.amount + this.timestamp + this.type + this.status + this.prevHash)
    .digest('hex');
});
TransactionSchema.statics.validateTransactions = async function () {
  const transactions = await this.find();
  return transactions.every(
    (transaction, index) => transaction.prevHash === (transactions[index - 1]?.hash ?? ''),
  );
};

const TransactionModel = model('Transaction', TransactionSchema);

export default TransactionModel;
