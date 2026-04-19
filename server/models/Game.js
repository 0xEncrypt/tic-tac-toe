const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  winner: { type: String, required: true },
  board: { type: [String], required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);