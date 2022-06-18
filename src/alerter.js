import UserModel from './models/user.js';
import LoanRequestModel from './models/loanRequest.js';
import mail from '@sendgrid/mail';

mail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendMailToAdmins(content) {
  const admins = await UserModel.find({ type: 'admin' });

  const formatMessage = (admin) => ({
    to: admin.email,
    from: process.env.SENDGRID_FROM,
    subject: 'Lev Bank Alert',
    text: content,
  });

  admins.forEach((admin) => {
    mail.send(formatMessage(admin));
  });
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
  ).forEach((loan) => sendMailToAdmins(`Loan with ID ${loan.id} is invalid/expired.`));
};

setInterval(updateLoanStatus, 1000 * 20);
