const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: 'Home',
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    addresses: {
      type: [addressSchema],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.methods.addAddress = function (address) {
  const shouldBeDefault = address.isDefault || this.addresses.length === 0;

  if (shouldBeDefault) {
    this.addresses.forEach((existingAddress) => {
      existingAddress.isDefault = false;
    });
  }

  this.addresses.push({ ...address, isDefault: shouldBeDefault });
  return this.addresses[this.addresses.length - 1];
};

const User = mongoose.model('User', userSchema);

module.exports = User;