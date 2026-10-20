require("dotenv").config();
const dns = require("dns");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { initializeDB } = require("./db/db.connect.js");
const Product = require("./models/product.model");
const User = require("./models/user.model");
const Review = require("./models/review.model");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === "production" ? "" : "veloce-dev-secret"
);

app.use(express.json());
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "https://veloce-vert-one.vercel.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn("FRONTEND_ORIGIN is not configured; credentialed cross-origin requests will be blocked.");
}

app.use((req, res, next) => {
  const isPublicProductRequest =
    (req.path === "/products" || /^\/products\/[^/]+\/reviews$/.test(req.path)) &&
    (req.method === "GET" ||
      (req.method === "OPTIONS" && req.headers["access-control-request-method"] === "GET"));

  return cors(isPublicProductRequest
    ? { origin: "*" }
    : {
        origin: allowedOrigins,
        credentials: true,
      })(req, res, next);
});

app.use(async (req, res, next) => {
  if (req.method === "OPTIONS" || req.path === "/logout") {
    return next();
  }

  try {
    await initializeDB();
    return next();
  } catch (error) {
    console.error("Database connection error:", error.message);
    return res.status(503).json({ error: "Database unavailable" });
  }
});

const requireJwtSecret = (req, res, next) => {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: "Authentication is not configured; set JWT_SECRET" });
  }
  return next();
};

const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const setSessionCookie = (res, user) => {
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("veloce_session", token, sessionCookieOptions);
};

const clearSessionCookie = (res) => {
  res.clearCookie("veloce_session", {
    httpOnly: true,
    secure: sessionCookieOptions.secure,
    sameSite: sessionCookieOptions.sameSite,
    path: "/",
  });
};

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  addresses: (user.addresses || []).map((address) => ({
    ...address.toObject ? address.toObject() : address,
    _id: address._id ? String(address._id) : undefined,
  })),
  cart: (user.cart || []).map((item) => ({
    productId: String(item.productId),
    quantity: item.quantity,
  })),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const buildAddressPayload = (address = {}) => {
  const nextAddress = { ...address };

  if (typeof nextAddress.label === "string") {
    nextAddress.label = nextAddress.label.trim() || "Home";
  } else {
    nextAddress.label = "Home";
  }

  [
    "fullName",
    "phone",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "country",
  ].forEach((field) => {
    if (typeof nextAddress[field] === "string") {
      nextAddress[field] = nextAddress[field].trim();
    }
  });

  nextAddress.isDefault = Boolean(nextAddress.isDefault);

  return nextAddress;
};

const validateAddressPayload = (address) => {
  if (!address || typeof address !== "object") {
    return "Address details are required";
  }

  const requiredFields = [
    "fullName",
    "phone",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "country",
  ];

  for (const field of requiredFields) {
    if (!String(address[field] || "").trim()) {
      return `${field} is required`;
    }
  }

  return null;
};

const validateReviewPayload = (review) => {
  const rating = Number(review?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "Rating must be an integer from 1 to 5";
  }

  if (review.comment !== undefined && typeof review.comment !== "string") {
    return "Review comment must be text";
  }

  if (typeof review.comment === "string" && review.comment.trim().length > 2000) {
    return "Review comment must be 2000 characters or fewer";
  }

  return null;
};

const authenticate = async (req, res, next) => {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: "Authentication is not configured; set JWT_SECRET" });
  }

  try {
    const cookieHeader = req.headers.cookie || "";
    const sessionCookie = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("veloce_session="));

    if (!sessionCookie) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = decodeURIComponent(sessionCookie.slice("veloce_session=".length));
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

async function createProduct(newProduct) {
  try {
    const product = new Product(newProduct);
    const savedProduct = await product.save();
    console.log("Product created in DB:", savedProduct);
    return savedProduct;
  } catch (error) {
    console.error("Error saving to database:", error);
    throw error;
  }
}

app.post("/products", async (req, res) => {
  try {
    console.log("POST /products route hit! Body:", req.body);
    const newProduct = req.body;
    const savedProduct = await createProduct(newProduct);
    res
      .status(201)
      .json({ message: "Product created successfully", product: savedProduct });
  } catch (error) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

async function getAllProducts() {
  try {
    const products = await Product.find();
    console.log("Products retrieved from DB:", products);
    return products;
  } catch (error) {
    console.error("Error retrieving products from database:", error);
    throw error;
  }
}

app.get("/products", async (req, res) => {
  try {
    console.log("GET /products route hit!");
    const [products, reviewSummaries] = await Promise.all([
      getAllProducts(),
      Review.aggregate([
        {
          $group: {
            _id: "$product",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]),
    ]);
    const summariesByProductId = new Map(
      reviewSummaries.map((summary) => [String(summary._id), summary])
    );

    res.status(200).json({
      products: products.map((product) => {
        const summary = summariesByProductId.get(String(product._id));
        return {
          ...product.toObject(),
          ratingAverage: summary?.averageRating || 0,
          reviewCount: summary?.reviewCount || 0,
        };
      }),
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to retrieve products" });
  }
});

async function createUser(newUser) {
  try {
    const user = new User(newUser);
    const savedUser = await user.save();
    return savedUser;
  } catch (error) {
    console.error("Error saving user to database:", error);
    throw error;
  }
}

app.post("/signup", requireJwtSecret, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const savedUser = await createUser({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    setSessionCookie(res, savedUser);

    res.status(201).json({
      message: "User created successfully",
      user: sanitizeUser(savedUser),
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/login", requireJwtSecret, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    setSessionCookie(res, user);

    res.status(200).json({
      message: "Login successful",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.get("/me", authenticate, async (req, res) => {
  try {
    res.status(200).json({ user: sanitizeUser(req.user) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get("/products/:productId/reviews", async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const requestedPage = Number.parseInt(req.query.page, 10) || 1;
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 10;
    const page = Math.max(requestedPage, 1);
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const [summary] = await Review.aggregate([
      { $match: { product: product._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    const [reviews, total] = await Promise.all([
      Review.find({ product: product._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name")
        .lean(),
      Review.countDocuments({ product: product._id }),
    ]);

    return res.status(200).json({
      summary: {
        averageRating: summary?.averageRating || 0,
        reviewCount: summary?.reviewCount || 0,
      },
      reviews: reviews.map((review) => ({
        _id: String(review._id),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        user: review.user
          ? { _id: String(review.user._id), name: review.user.name }
          : { name: "Rider" },
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

app.get("/products/:productId/reviews/me", authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const review = await Review.findOne({ product: productId, user: req.user._id }).lean();
    return res.status(200).json({
      review: review
        ? {
            _id: String(review._id),
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Get own review error:", error);
    return res.status(500).json({ error: "Failed to fetch your review" });
  }
});

app.post("/products/:productId/reviews", authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const validationError = validateReviewPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const product = await Product.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const review = await Review.create({
      product: product._id,
      user: req.user._id,
      rating: Number(req.body.rating),
      comment: req.body.comment?.trim() || "",
    });

    return res.status(201).json({
      message: "Review saved successfully",
      review: {
        _id: String(review._id),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "You have already reviewed this product" });
    }
    console.error("Create review error:", error);
    return res.status(500).json({ error: "Failed to save review" });
  }
});

app.put("/products/:productId/reviews/me", authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const validationError = validateReviewPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const review = await Review.findOneAndUpdate(
      { product: productId, user: req.user._id },
      {
        rating: Number(req.body.rating),
        comment: req.body.comment?.trim() || "",
      },
      { new: true, runValidators: true }
    ).lean();

    if (!review) {
      return res.status(404).json({ error: "Your review was not found" });
    }

    return res.status(200).json({
      message: "Review updated successfully",
      review: {
        _id: String(review._id),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    console.error("Update review error:", error);
    return res.status(500).json({ error: "Failed to update review" });
  }
});

app.get("/addresses", authenticate, async (req, res) => {
  try {
    res.status(200).json({ addresses: sanitizeUser(req.user).addresses });
  } catch (error) {
    console.error("Get addresses error:", error);
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

app.post("/addresses", authenticate, async (req, res) => {
  try {
    const validationError = validateAddressPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const address = buildAddressPayload(req.body);
    const shouldBeDefault = address.isDefault || req.user.addresses.length === 0;

    if (shouldBeDefault) {
      req.user.addresses.forEach((existingAddress) => {
        existingAddress.isDefault = false;
      });
    }

    req.user.addresses.push({ ...address, isDefault: shouldBeDefault });
    await req.user.save();

    const savedAddress = req.user.addresses[req.user.addresses.length - 1].toObject
      ? req.user.addresses[req.user.addresses.length - 1].toObject()
      : req.user.addresses[req.user.addresses.length - 1];

    return res.status(201).json({
      message: "Address saved successfully",
      address: savedAddress,
      addresses: sanitizeUser(req.user).addresses,
    });
  } catch (error) {
    console.error("Create address error:", error);
    return res.status(500).json({ error: "Failed to save address" });
  }
});

app.put("/addresses/:addressId", authenticate, async (req, res) => {
  try {
    const { addressId } = req.params;
    const validationError = validateAddressPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const addressIndex = req.user.addresses.findIndex(
      (address) => String(address._id) === String(addressId)
    );

    if (addressIndex === -1) {
      return res.status(404).json({ error: "Address not found" });
    }

    const nextAddress = buildAddressPayload({
      ...req.user.addresses[addressIndex].toObject
        ? req.user.addresses[addressIndex].toObject()
        : req.user.addresses[addressIndex],
      ...req.body,
    });

    if (nextAddress.isDefault) {
      req.user.addresses.forEach((existingAddress) => {
        existingAddress.isDefault = String(existingAddress._id) === String(addressId);
      });
    } else if (!req.user.addresses.some((existingAddress) => existingAddress.isDefault)) {
      nextAddress.isDefault = true;
    }

    req.user.addresses[addressIndex] = { ...nextAddress, _id: req.user.addresses[addressIndex]._id };
    await req.user.save();

    return res.status(200).json({
      message: "Address updated successfully",
      addresses: sanitizeUser(req.user).addresses,
    });
  } catch (error) {
    console.error("Update address error:", error);
    return res.status(500).json({ error: "Failed to update address" });
  }
});

app.delete("/addresses/:addressId", authenticate, async (req, res) => {
  try {
    const { addressId } = req.params;
    const addressIndex = req.user.addresses.findIndex(
      (address) => String(address._id) === String(addressId)
    );

    if (addressIndex === -1) {
      return res.status(404).json({ error: "Address not found" });
    }

    const [removedAddress] = req.user.addresses.splice(addressIndex, 1);

    if (req.user.addresses.length > 0 && removedAddress.isDefault) {
      req.user.addresses[0].isDefault = true;
    }

    await req.user.save();

    return res.status(200).json({
      message: "Address removed successfully",
      addresses: sanitizeUser(req.user).addresses,
    });
  } catch (error) {
    console.error("Delete address error:", error);
    return res.status(500).json({ error: "Failed to remove address" });
  }
});

app.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ message: "Logged out successfully" });
});

app.get("/cart", authenticate, (req, res) => {
  res.status(200).json({ cart: sanitizeUser(req.user).cart });
});

app.put("/cart", authenticate, async (req, res) => {
  try {
    const submittedCart = req.body.cart;
    if (!Array.isArray(submittedCart)) {
      return res.status(400).json({ error: "Cart must be an array" });
    }

    const quantitiesByProduct = new Map();
    for (const item of submittedCart) {
      const productId = String(item?.productId || "");
      const quantity = Number(item?.quantity);

      if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Cart items need a valid product ID and positive integer quantity" });
      }

      quantitiesByProduct.set(
        productId,
        (quantitiesByProduct.get(productId) || 0) + quantity
      );
    }

    const products = await Product.find({
      _id: { $in: [...quantitiesByProduct.keys()] },
      isActive: true,
    });
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    for (const [productId, quantity] of quantitiesByProduct) {
      const product = productsById.get(productId);
      if (!product) {
        return res.status(400).json({ error: "Cart contains an unavailable product" });
      }
      if (quantity > product.stock) {
        return res.status(400).json({ error: `${product.name} has only ${product.stock} in stock` });
      }
    }

    req.user.cart = [...quantitiesByProduct].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    await req.user.save();

    res.status(200).json({ cart: sanitizeUser(req.user).cart });
  } catch (error) {
    console.error("Cart update error:", error);
    res.status(500).json({ error: "Failed to update cart" });
  }
});

if (!process.env.VERCEL) {
  initializeDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Main Server is running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Unable to connect to MongoDB:", error.message);
      process.exitCode = 1;
    });
}

module.exports = app;
