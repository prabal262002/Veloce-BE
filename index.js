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

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === "production" ? null : "veloce-dev-secret"
);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in production");
}

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  credentials: true,
}));

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
  addresses: user.addresses || [],
  cart: (user.cart || []).map((item) => ({
    productId: String(item.productId),
    quantity: item.quantity,
  })),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const authenticate = async (req, res, next) => {
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
    const products = await getAllProducts();
    if(products.length > 0) {
        res.json({ products });
    }else {
        res.status(404).json({ message: "No products found" });
    }
  } catch (error) {
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

app.post("/signup", async (req, res) => {
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

app.post("/login", async (req, res) => {
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

initializeDB();

app.listen(PORT, () => {
  console.log(`Main Server is running on port ${PORT}`);
});
