export default class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.hash = this.calculateHash();
  }

  validateBlock() {
    return this.transactions.every((transaction) => transaction.isValid());
  }
}
