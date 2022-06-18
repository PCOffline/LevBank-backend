import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ChatSchema = new mongoose.Schema(
  {
    sender: { type: Schema.Types.String, required: true },
    recipient: { type: Schema.Types.String, required: true },
    message: { type: Schema.Types.String, required: true },
    timestamp: { type: Schema.Types.Date, required: true },
  },
  {
    toObject: {
      virtuals: true,
    },
  },
);

ChatSchema.virtual('senderUser', {
  ref: 'User',
  localField: 'sender',
  foreignField: 'username',
  justOne: true, // for many-to-1 relationships
});

ChatSchema.virtual('recipientUser', {
  ref: 'User',
  localField: 'recipient',
  foreignField: 'username',
  justOne: true, // for many-to-1 relationships
});

const ChatModel = model('Chat', ChatSchema);

export default ChatModel;
