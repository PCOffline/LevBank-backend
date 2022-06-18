import UserModel from './models/user.js';
import LoanRequestModel from './models/loanRequest.js';

async function sendMailToAdmins(content) {
  const admins = await UserModel.find({ type: 'admin' });
}

export async function getInvalidLoans() {
  const loans = await LoanRequestModel.find({
    type: 'loan',
    status: 'approved',
  }).populate('recipientUser senderUser');

  const formattedLoans = await Promise.all(
    loans.map(async (loan) => {
      const { recipientUser, senderUser } = loan;

      return {
        ...loan.toJSON(),
        recipientUser: {
          ...recipientUser.toJSON(),
          balance: await recipientUser.getBalance(),
        },
        senderUser: {
          ...senderUser.toJSON(),
          balance: await senderUser.getBalance(),
        },
      };
    }),
  );

  return formattedLoans.filter(
    (loan) =>
      loan.recipientUser.balance * 0.6 < loan.amount ||
      loan.senderUser.balance / 2 < loan.amount ||
      loan.expiryDate < new Date(),
  );
}

export async function getZeroBalanceUsers() {
  const users = await UserModel.find();
  const populatedUsers = await Promise.all(users.map((user) => user.getFilteredUser()));
  return populatedUsers.filter((user) => user.balance === 0);
}

const updateLoanStatus = async () => {
  const invalidLoans = await getInvalidLoans();

  await LoanRequestModel.updateMany(
    { _id: { $in: invalidLoans.map((loan) => loan._id) } },
    { status: 'invalid' },
  );
};

setInterval(updateLoanStatus, 1000 * 20);
