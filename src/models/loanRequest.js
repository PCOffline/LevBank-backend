import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const LoanRequestSchema = new Schema({
  recipient: { type: Schema.Types.String, required: true },
  sender: { type: Schema.Types.String, required: true },
  amount: { type: Schema.Types.Number, required: true },
  description: { type: Schema.Types.String, required: false },
  status: { type: Schema.Types.String, required: true, enum: ['pending', 'approved', 'rejected', 'repaid', 'invalid']},
  timestamp: { type: Schema.Types.Date, default: new Date(), required: true },
  expiryDate: { type: Schema.Types.Date, default: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 30), required: true },
});

LoanRequestSchema.virtual('recipientUser', {
  ref: 'User',
  localField: 'recipient',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

LoanRequestSchema.virtual('senderUser', {
  ref: 'User',
  localField: 'sender',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

const LoanRequestModel = model('LoanRequest', LoanRequestSchema);

export default LoanRequestModel;
