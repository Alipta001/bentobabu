const mongoose = require('mongoose');

const serviceExpansionVoteSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: [true, 'PIN code is required'],
      trim: true,
      index: true,
      validate: {
        validator: function (v) {
          return /^[1-9][0-9]{5}$/.test(v);
        },
        message: 'Invalid Indian 6-digit PIN code format',
      },
    },
    locality: {
      type: String,
      default: '',
      trim: true,
    },
    city: {
      type: String,
      default: '',
      trim: true,
    },
    state: {
      type: String,
      default: '',
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    anonymousIdentifier: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    customerPhone: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['NEW', 'UNDER_CONSIDERATION', 'PLANNED', 'LAUNCHED', 'REJECTED'],
      default: 'NEW',
      index: true,
    },
    internalNotes: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      default: 'CHECKOUT_UNSERVICEABLE',
      trim: true,
    },
    voteCount: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for deduplication and fast queries
// 1. One active vote per customer per normalized PIN code
serviceExpansionVoteSchema.index(
  { pincode: 1, customer: 1 },
  {
    unique: true,
    partialFilterExpression: { customer: { $type: 'objectId' } },
  }
);

// 2. One active vote per anonymous identifier per normalized PIN code
serviceExpansionVoteSchema.index(
  { pincode: 1, anonymousIdentifier: 1 },
  {
    unique: true,
    partialFilterExpression: { anonymousIdentifier: { $type: 'string' } },
  }
);

// 3. Location grouping and status indexing
serviceExpansionVoteSchema.index({ pincode: 1, status: 1 });
serviceExpansionVoteSchema.index({ createdAt: -1 });

const ServiceExpansionVote = mongoose.model(
  'ServiceExpansionVote',
  serviceExpansionVoteSchema
);

module.exports = ServiceExpansionVote;
