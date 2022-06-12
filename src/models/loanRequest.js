import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const LoanRequestSchema = new Schema({
  requester: { type: Schema.Types.String, required: true },
  requestee: { type: Schema.Types.String, required: true },
  amount: { type: Schema.Types.Number, required: true },
  type: { type: Schema.Types.String, enum: ['loan', 'lend'], required: true },
  status: { type: Schema.Types.String, required: true, enum: ['pending', 'approved', 'rejected', 'repaid']},
  timestamp: { type: Schema.Types.Date, default: new Date(), required: true },
});

LoanRequestSchema.virtual('requesterUser', {
  ref: 'User',
  localField: 'requester',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

LoanRequestSchema.virtual('requesteeUser', {
  ref: 'User',
  localField: 'requestee',
  foreignField: 'username',
  justOne: true // for many-to-1 relationships
});

const LoanRequestModel = model('LoanRequest', LoanRequestSchema);

export default LoanRequestModel;
