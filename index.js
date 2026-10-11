require("dotenv").config();
const dns = require("dns");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { initializeDB } = require("./db/db.connect.js");
const Product = require("./models/product.model");
const User = require("./models/user.model");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || "veloce-dev-secret";

app.use(express.json());
app.use(cors()); 

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  addresses: user.addresses || [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createToken = (user) =>
  jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
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
    console.log("User created in DB:", savedUser);
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

    const token = createToken(savedUser);

    res.status(201).json({
      message: "User created successfully",
      token,
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

    const token = createToken(user);

    res.status(200).json({
      message: "Login successful",
      token,
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

initializeDB();

app.listen(PORT, () => {
  console.log(`Main Server is running on port ${PORT}`);
});
