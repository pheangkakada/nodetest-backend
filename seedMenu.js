const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

/* ===== CONNECT DB ===== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected (Seed)"))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

/* ===== MENU SCHEMA ===== */
const MenuSchema = new mongoose.Schema({
  name: String,
  originalPrice: Number,
  category: String,
  type: String,
  isPromo: Boolean,
  promoPrice: Number,
  badge: String,
  image: String
});

const MenuItem = mongoose.model("MenuItem", MenuSchema);

/* ===== MENU DATA ===== */
const menuData = [
  {
    name: "Fried Rice",
    originalPrice: 2.5,
    category: "Food",
    type: "Main",
    isPromo: false,
    promoPrice: 0,
    badge: "",
    image: "fried_rice.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Beef Noodle",
    originalPrice: 3.0,
    category: "Food",
    type: "Main",
    isPromo: true,
    promoPrice: 2.5,
    badge: "PROMO",
    image: "beef_noodle.jpg"
  },
  {
    name: "Coca Cola",
    originalPrice: 1.0,
    category: "Drink",
    type: "Beer",
    isPromo: false,
    promoPrice: 0,
    badge: "",
    image: "coke.jpg"
  }
];

/* ===== INSERT ONLY ===== */
const seedMenu = async () => {
  try {
    await MenuItem.insertMany(menuData);
    console.log("✅ Menu inserted successfully");
    process.exit();
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    process.exit(1);
  }
};

seedMenu();
