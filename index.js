require("dotenv").config();
const dns = require("dns");
const express = require("express");
const cors = require("cors");
const { initializeDB } = require("./db/db.connect.js");
const Product = require("./models/product.model");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(cors());

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

initializeDB();

app.listen(PORT, () => {
  console.log(`Main Server is running on port ${PORT}`);
});
