const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB REAL connection works");
    process.exit();
  })
  .catch(err => {
    console.error("❌ Connection failed:", err.message);
    process.exit(1);
  });
