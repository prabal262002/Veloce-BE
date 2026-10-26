const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: [
        'parts',
        'gear',
        'accessories',
        'helmets',
        'riding-jackets',
        'riding-pants',
        'gloves',
        'boots',
        'protection',
        'tires',
        'brakes',
        'exhaust',
        'suspension',
        'electronics',
        'luggage',
        'maintenance',
      ],
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    images: [
      {
        type: String,
      },
    ],

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    compatibleBikes: [
      {
        type: String,
        trim: true,
      },
    ],

    specifications: {
      type: Map,
      of: String,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

const Product = mongoose.model('Product', productSchema);

module.exports = Product;