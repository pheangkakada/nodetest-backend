const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const dotenv = require("dotenv");

const connectDB = require("./config/db");
const mongoose = require("mongoose");

const http = require("http");
const { Server } = require("socket.io");

const { sendInvoiceNotification } = require('./telegram');
const { sendDailyReport } = require('./telegramReport');


dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use(cors());
app.use(bodyParser.json());
/* ================== AUTHENTICATION MIDDLEWARE ================== */

// Simple authentication middleware (you should use proper JWT in production)
const authenticate = (req, res, next) => {
    // For now, we'll just check for an admin token in headers
    // In production, use proper JWT/session authentication
    const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
    
    if (!adminToken || adminToken !== 'admin_secret_key') {
        // Check if this is a public API route
        const publicRoutes = [
            '/api/menu',
            '/api/menu/category',
            '/api/menu/',
            '/api/invoices',
            '/'
        ];
        
        const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
        
        if (!isPublicRoute) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    
    next();
};

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. CREATE NEW USER
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, fullName, role, id } = req.body;
        
        if (id) {
            // Update Existing
            const updates = { username, fullName, role };
            if (password) updates.password = password; // Only update PIN if provided
            const user = await User.findByIdAndUpdate(id, updates, { new: true });
            return res.json({ message: 'User updated', user });
        } else {
            // Create New
            const existing = await User.findOne({ username });
            if (existing) return res.status(400).json({ error: 'Operator ID already exists' });
            
            const newUser = new User({ username, password, fullName, role });
            await newUser.save();
            res.status(201).json({ message: 'User created', user: newUser });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. RESET PASSWORD (PIN) ONLY
app.put('/api/users/:id/reset-pin', async (req, res) => {
    try {
        const { newPin } = req.body;
        if (!newPin || newPin.length !== 4) return res.status(400).json({ error: "PIN must be 4 digits" });
        
        await User.findByIdAndUpdate(req.params.id, { password: newPin });
        res.json({ message: "Security PIN reset successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. DELETE USER
app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) return res.status(401).json({ error: 'Operator ID not found' });
        if (user.password !== password) return res.status(401).json({ error: 'Invalid Security PIN' });

        user.lastLogin = new Date();
        await user.save();

        res.json({
            message: 'Login successful',
            user: { username: user.username, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/users/logout', async (req, res) => {
    try {
        const { username } = req.body;
        if (username) {
            const user = await User.findOne({ username });
            if (user) {
                user.lastLogout = new Date();
                await user.save();
            }
        }
        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Server error during logout' });
    }
});

// Apply authentication middleware to admin routes
app.use('/api/admin', authenticate);

/* ================== MODELS ================== */

// Counter Schema for persistent IDs
const CounterSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 }
});
const Counter = mongoose.model("Counter", CounterSchema);

// Item Schema (for invoice items)
const ItemSchema = new mongoose.Schema({
    name: String,
    quantity: Number,
    price: Number,
    total: Number
});

// Invoice Schema
const InvoiceSchema = new mongoose.Schema({
    invoiceId: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    table: { type: String, default: "0" },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    paymentMethod: { type: String, default: 'cash' },
    items: [ItemSchema],
    subtotal: Number,
    discount: Number,
    total: Number,
    exchangeRate: { type: Number },  
    createdBy: { type: String, default: 'cashier' },
    lastModifiedBy: { type: String },
    lastModifiedAt: { type: Date }
});

// Menu Schema
const MenuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    categories: { 
        type: [String], 
        default: [], 
        required: true 
    },
    type: { type: String },
    isPromo: { type: Boolean, default: false },
    promoPrice: { type: Number },
    badge: { type: String },
    image: { type: String },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    fullName: { type: String },
    role: { type: String, enum: ['admin', 'cashier', 'staff'], default: 'cashier' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: null },
    lastLogout: { type: Date, default: null }
});

// Category Schema
const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Settings Schema
const SettingsSchema = new mongoose.Schema({
    storeName: { type: String, default: 'Paint Coffee' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    wifiPassword: { type: String, default: '' },
    receiptHeader: { type: String },
    receiptFooter: { type: String },
    receiptLogo: { type: String },
    exchangeRate: { type: Number, default: 4000 }, 
    pendingExchangeRate: { type: Number }, 
    rateEffectiveAt: { type: Date }        
}, { timestamps: true });

// Create Models
const Invoice = mongoose.model("Invoice", InvoiceSchema);
const MenuItem = mongoose.model("MenuItem", MenuSchema);
const User = mongoose.model("User", UserSchema);
const Category = mongoose.model("Category", CategorySchema);
const Settings = mongoose.model("Settings", SettingsSchema);

/* ================== INITIAL DATA SETUP ================== */

async function initializeData() {
    try {
        console.log('🔄 Initializing database...');
        
        try {
            await User.collection.dropIndex('email_1');
            console.log("✅ SUCCESS: Dropped problematic 'email_1' index.");
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log("ℹ️ Note: 'email_1' index not found (system is clean).");
            } else {
                console.log("⚠️ Non-critical warning checking indexes:", error.message);
            }
        }

        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const adminUser = new User({
                username: 'admin',
                password: 'admin123',
                role: 'admin',
                status: 'active'
            });
            await adminUser.save();
            console.log('✅ Default admin user created');
        }

        console.log('ℹ️ Categories will not be created automatically. Use admin panel to create categories.');

        const menuItemsCount = await MenuItem.countDocuments();
        console.log(`📊 Current menu items count: ${menuItemsCount}`);
        
        if (menuItemsCount === 0) {
            console.log('ℹ️ No menu items found. Admin must add items through the admin panel.');
        }

        const settingsExist = await Settings.findOne();
        if (!settingsExist) {
            const defaultSettings = new Settings({});
            await defaultSettings.save();
            console.log('✅ Default settings created');
        }

        const counterExists = await Counter.findOne({ name: 'invoiceId' });
        if (!counterExists) {
            await Counter.create({ name: 'invoiceId', value: 1 });
            console.log('✅ Invoice counter initialized');
        }

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

mongoose.connection.once('open', () => {
    console.log('✅ MongoDB connected');
    initializeData();
});

/* ================== INVOICE ID GENERATION ================== */

const generateInvoiceId = async () => {
    try {
        const counter = await Counter.findOneAndUpdate(
            { name: 'invoiceId' },
            { $inc: { value: 1 } },
            { new: true, upsert: true }
        );
        const id = counter.value.toString().padStart(6, "0");
        return `INV-${id}`;
    } catch (error) {
        console.error('Error generating invoice ID:', error);
        const timestamp = Date.now().toString().slice(-6);
        return `INV-${timestamp}`;
    }
};

/* ================== PUBLIC API ROUTES ================== */

app.get("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne().lean();
        if (!settings) {
            settings = { exchangeRate: 4000 }; 
        }
        
        res.json({
            exchangeRate: settings.exchangeRate || 4000,
            currency: settings.currency || 'USD',
            taxRate: settings.taxRate || 0,
            receiptHeader: settings.receiptHeader || "",
            receiptFooter: settings.receiptFooter || "",
            receiptLogo: settings.receiptLogo || "",
            storeName: settings.storeName || "Paint Coffee"
        });
        
    } catch (error) {
        console.error('❌ /api/settings: Error:', error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

app.put('/api/settings', authenticate, async (req, res) => {
    try {
        const updates = req.body;
        
        if (updates.exchangeRate) {
            const currentSettings = await Settings.findOne();
            const newRate = parseFloat(updates.exchangeRate);

            if (currentSettings && currentSettings.exchangeRate !== newRate) {
                const nextMidnight = new Date();
                nextMidnight.setHours(24, 0, 0, 0); 

                updates.pendingExchangeRate = newRate;
                updates.rateEffectiveAt = nextMidnight;
                
                delete updates.exchangeRate; 
                
                console.log(`⏳ Rate Change Scheduled: ${newRate} to apply at ${nextMidnight}`);
            }
        }

        const settings = await Settings.findOneAndUpdate(
            {}, 
            { $set: updates },
            { new: true, upsert: true } 
        );
        
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/menu", async (req, res) => {
    try {
        console.log('📋 /api/menu: Fetching all ACTIVE menu items');
        
        const menu = await MenuItem.find({ isActive: true })
            .sort({ name: 1 })
            .lean();
        
        const transformedMenu = menu.map(item => {
            const itemId = item._id ? item._id.toString() : item.id;
            const categoriesList = Array.isArray(item.categories) && item.categories.length > 0 
                ? item.categories 
                : (item.category ? [item.category] : ['Uncategorized']);

            return {
                ...item,
                id: itemId,
                _id: itemId,
                category: categoriesList[0],
                categories: categoriesList, 
                name: item.name || 'Unnamed Item',
                originalPrice: item.originalPrice || 0,
                isActive: item.isActive !== false,
                isPromo: item.isPromo || false,
                promoPrice: item.promoPrice || null,
                badge: item.badge || null,
                image: item.image || 'https://via.placeholder.com/200x130/F5F7FA/9E9E9E?text=No+Image'
            };
        });
        
        res.json(transformedMenu);
        
    } catch (error) {
        console.error('❌ /api/menu: Error fetching menu:', error);
        res.status(500).json({ error: "Failed to fetch menu items" });
    }
});

app.get("/api/categories", async (req, res) => {
    try {
        const categories = await Category.find({}).sort({ name: 1 }).lean().exec();
        
        if (!categories || categories.length === 0) {
            return res.json([]);
        }
        
        const categoryNames = categories
            .map(cat => cat.name)
            .filter(name => name && name.trim() !== '');
        
        res.json(categoryNames);
    } catch (error) {
        console.error('❌ /api/categories: Error:', error);
        res.json([]);
    }
});

app.get("/api/menu/category/:category", async (req, res) => {
    try {
        const { category } = req.params;
        let filter = { isActive: true };
        
        if (category && category !== "All") {
            filter = { 
                categories: category,
                isActive: true 
            };
        }

        const menu = await MenuItem.find(filter).sort({ name: 1 }).lean();
        
        const transformedMenu = menu.map(item => {
            const itemId = item._id ? item._id.toString() : item.id;
            return {
                ...item,
                id: itemId,
                _id: itemId,
                category: item.categories && item.categories.length > 0 ? item.categories[0] : 'Uncategorized',
                categories: item.categories || []
            };
        });
        
        res.json(transformedMenu);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch menu" });
    }
});

app.get("/api/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const item = await MenuItem.findOne({
            $or: [{ _id: id }, { id: id }],
            isActive: true
        }).lean();
        
        if (!item) return res.status(404).json({ error: "Menu item not found" });
        
        const itemId = item._id ? item._id.toString() : item.id;
        res.json({ ...item, id: itemId, _id: itemId });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch menu item" });
    }
});

// ====== INVOICE API ======
app.get("/api/invoices", async (req, res) => {
    try {
        const invoices = await Invoice.find().sort({ date: -1 }).lean();
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch invoices" });
    }
});

app.get("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && (mongoose.Types.ObjectId(id).toString() === id);
        
        let invoice = isObjectId ? await Invoice.findById(id).lean() : await Invoice.findOne({ invoiceId: id }).lean();
        
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });
        
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch invoice" });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.post("/api/invoices", async (req, res) => {
    try {
        const invoiceId = await generateInvoiceId();
        const invoiceData = { invoiceId, ...req.body, date: new Date() };
        
        const invoice = new Invoice(invoiceData);
        await invoice.save();
        
        // 🚀 Trigger Telegram Notification here!
        // We use .catch() so if Telegram fails, it doesn't crash your server or stop the POS receipt
        sendInvoiceNotification(invoice).catch(err => console.error('Telegram Error:', err));
        
        req.io.emit('invoice_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់
        
        res.status(201).json(invoice);
    } catch (err) {
        res.status(500).json({ error: "Create invoice failed" });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.put("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && (mongoose.Types.ObjectId(id).toString() === id);
        const query = isObjectId ? { _id: id } : { invoiceId: id };
        
        const existingInvoice = await Invoice.findOne(query);
        if (!existingInvoice) return res.status(404).json({ error: "Invoice not found" });
        
        const isAdmin = req.headers['x-user-role'] === 'admin' || req.query.user_role === 'admin' || (req.body.user && req.body.user.role === 'admin');
        
        if (!isAdmin && existingInvoice.status !== 'pending') {
            return res.status(403).json({ error: "Permission denied. Only administrators can edit paid invoices." });
        }
        
        const updateData = { ...req.body, lastModifiedAt: new Date(), lastModifiedBy: isAdmin ? 'admin' : 'cashier' };
        
        const invoice = await Invoice.findOneAndUpdate(query, updateData, { new: true }).lean();
        
        req.io.emit('invoice_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់

        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: "Failed to update invoice" });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.delete("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);
        const query = isObjectId ? { _id: id } : { invoiceId: id };

        const invoice = await Invoice.findOne(query);
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });

        if (invoice.status === 'cancelled') {
            await Invoice.deleteOne(query);
            req.io.emit('invoice_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់
            return res.json({ message: "Invoice permanently deleted", id: id, type: 'hard' });
        } else {
            invoice.status = 'cancelled';
            invoice.lastModifiedAt = new Date();
            await invoice.save();
            req.io.emit('invoice_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់
            return res.json({ message: "Invoice marked as deleted", invoice: invoice, type: 'soft' });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to delete invoice" });
    }
});

/* ================== ADMIN API ROUTES ================== */

app.get("/api/admin/menu", async (req, res) => {
    try {
        const items = await MenuItem.find().sort({ createdAt: -1 }).lean();
        const transformedItems = items.map(item => {
            const itemId = item._id ? item._id.toString() : item.id;
            return { ...item, id: itemId, _id: itemId };
        });
        res.json(transformedItems);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch menu items" });
    }
});

app.get("/api/admin/menu/:id", async (req, res) => {
    try {
        const item = await MenuItem.findById(req.params.id).lean();
        if (!item) return res.status(404).json({ error: "Item not found" });
        const itemId = item._id ? item._id.toString() : item.id;
        res.json({ ...item, id: itemId, _id: itemId });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch item" });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.post("/api/admin/menu", async (req, res) => {
    try {
        const { name, categories, originalPrice } = req.body;
        
        if (!name || !categories || !originalPrice) return res.status(400).json({ error: "Name, categories, and price are required" });
        
        const categoriesArray = Array.isArray(categories) ? categories : [categories];
        if (categoriesArray.length === 0) return res.status(400).json({ error: "At least one category is required" });
        
        const allCategories = await Category.find().lean();
        const existingCategoryNames = allCategories.map(c => c.name);
        
        const invalidCategories = categoriesArray.filter(cat => !existingCategoryNames.includes(cat));
        if (invalidCategories.length > 0) {
            return res.status(400).json({ error: `Categories "${invalidCategories.join(', ')}" do not exist.` });
        }
        
        const itemData = { ...req.body, categories: categoriesArray, isActive: true, createdAt: new Date() };
        
        const item = new MenuItem(itemData);
        await item.save();
        
        req.io.emit('menu_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់

        res.status(201).json(item);
    } catch (error) {
        res.status(500).json({ error: "Failed to create menu item", details: error.message });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.put("/api/admin/menu/:id", async (req, res) => {
    try {
        if (req.body.categories) {
            const categoriesArray = Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories];
            const allCategories = await Category.find().lean();
            const existingCategoryNames = allCategories.map(c => c.name);
            
            const invalidCategories = categoriesArray.filter(cat => !existingCategoryNames.includes(cat));
            if (invalidCategories.length > 0) {
                return res.status(400).json({ error: `Categories "${invalidCategories.join(', ')}" do not exist.` });
            }
            req.body.categories = categoriesArray;
        }
        
        const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
        if (!item) return res.status(404).json({ error: "Item not found" });
        
        req.io.emit('menu_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់

        res.json(item);
    } catch (error) {
        res.status(500).json({ error: "Failed to update menu item", details: error.message });
    }
});

// 📌 ADDED SOCKET.IO EMIT HERE
app.delete("/api/admin/menu/:id", async (req, res) => {
    try {
        const item = await MenuItem.findByIdAndDelete(req.params.id).lean();
        if (!item) return res.status(404).json({ error: "Item not found" });
        
        req.io.emit('menu_updated'); // បញ្ជូនសញ្ញាទៅកាន់ Client ទាំងអស់

        res.json({ message: "Menu item deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete menu item" });
    }
});

// ====== CATEGORIES MANAGEMENT ======
app.get("/api/admin/categories", async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 }).lean();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});

app.post("/api/admin/categories", async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || name.trim() === '') return res.status(400).json({ error: "Category name is required" });
        
        const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (existingCategory) return res.status(400).json({ error: "Category already exists" });
        
        const category = new Category({ name: name.trim(), description: description?.trim() || '', createdAt: new Date() });
        await category.save();
        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ error: "Failed to create category" });
    }
});

app.delete("/api/admin/categories/:id", async (req, res) => {
    try {
        const categoryName = await getCategoryNameById(req.params.id);
        const menuItemsUsingCategory = await MenuItem.countDocuments({ categories: categoryName });
        
        if (menuItemsUsingCategory > 0) {
            return res.status(400).json({ error: `Cannot delete category. ${menuItemsUsingCategory} menu item(s) are using this category.` });
        }
        
        const category = await Category.findByIdAndDelete(req.params.id).lean();
        if (!category) return res.status(404).json({ error: "Category not found" });
        
        res.json({ message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete category" });
    }
});

async function getCategoryNameById(id) {
    const category = await Category.findById(id);
    return category ? category.name : null;
}

// ====== USERS MANAGEMENT ======
app.get("/api/admin/users", async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.get("/api/admin/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password").lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

app.post("/api/admin/users", async (req, res) => {
    try {
        const existingUser = await User.findOne({ $or: [{ username: req.body.username }, { email: req.body.email }] });
        if (existingUser) return res.status(400).json({ error: "Username or email already exists" });
        
        const user = new User(req.body);
        await user.save();
        
        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: "Failed to create user" });
    }
});

app.put("/api/admin/users/:id", async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (!updateData.password || updateData.password.trim() === "") {
            delete updateData.password; 
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true }).select("-password");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Failed to update user" });
    }
});

app.delete("/api/admin/users/:id", async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id).lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// ====== SETTINGS MANAGEMENT ======
app.get("/api/admin/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne().lean();
        if (!settings) {
            settings = new Settings({});
            await settings.save();
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

app.put("/api/admin/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings(req.body);
        } else {
            Object.assign(settings, req.body);
            settings.updatedAt = new Date();
        }
        await settings.save();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: "Failed to update settings" });
    }
});

// ====== STATISTICS ======
app.get("/api/admin/stats", async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const [totalInvoices, todayInvoices, totalMenuItems, totalUsers] = await Promise.all([
            Invoice.countDocuments(),
            Invoice.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
            MenuItem.countDocuments({ isActive: true }),
            User.countDocuments({ status: "active" })
        ]);
        
        const totalRevenueResult = await Invoice.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        
        const todayRevenueResult = await Invoice.aggregate([
            { $match: { status: "paid", date: { $gte: today, $lt: tomorrow } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        
        res.json({
            totalInvoices, todayInvoices, totalMenuItems, totalUsers,
            totalRevenue: totalRevenueResult[0]?.total || 0,
            todayRevenue: todayRevenueResult[0]?.total || 0
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// ====== RECENT ORDERS ======
app.get("/api/admin/orders/recent", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const orders = await Invoice.find().sort({ date: -1 }).limit(limit).lean();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch recent orders" });
    }
});

// ====== ADMIN DASHBOARD SUMMARY ======
app.get("/api/admin/dashboard", async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const todayStart = new Date(today);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        const yesterdayStart = new Date(yesterday);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        
        const [totalInvoices, todayInvoices, yesterdayInvoices, totalMenuItems, activeUsers, pendingInvoices] = await Promise.all([
            Invoice.countDocuments(),
            Invoice.countDocuments({ date: { $gte: todayStart, $lt: todayEnd } }),
            Invoice.countDocuments({ date: { $gte: yesterdayStart, $lt: yesterdayEnd } }),
            MenuItem.countDocuments({ isActive: true }),
            User.countDocuments({ status: "active" }),
            Invoice.countDocuments({ status: "pending" })
        ]);
        
        const revenueResult = await Invoice.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        
        const todayRevenueResult = await Invoice.aggregate([
            { $match: { status: "paid", date: { $gte: todayStart, $lt: todayEnd } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        
        const recentOrders = await Invoice.find().sort({ date: -1 }).limit(5).lean();
        
        res.json({
            stats: {
                totalInvoices, todayInvoices, yesterdayInvoices, totalMenuItems, activeUsers, pendingInvoices,
                totalRevenue: revenueResult[0]?.total || 0,
                todayRevenue: todayRevenueResult[0]?.total || 0
            },
            recentOrders
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});

// Debug endpoint to check database status
app.get("/api/debug", async (req, res) => {
    try {
        const results = {
            mongodb: {
                state: mongoose.connection.readyState,
                stateName: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
            },
            collections: {
                menuItems: await MenuItem.countDocuments(),
                invoices: await Invoice.countDocuments(),
                users: await User.countDocuments(),
                categories: await Category.countDocuments()
            },
            server: { uptime: process.uptime(), timestamp: new Date().toISOString() }
        };
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger Shift Report from POS for a specific user
// Trigger Shift Report from POS for the logged-in user
app.post('/api/reports/send-daily', async (req, res) => {
    try {
        const { username } = req.body; // Receive the username from the POS
        
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Filter: Find today's PAID invoices created ONLY by this user
        const query = {
            date: { $gte: startOfDay, $lte: endOfDay },
            status: 'paid'
        };

        // Only apply the filter if a username is provided (Admin sees all)
        if (username && username !== 'admin') {
            query.createdBy = username;
        }

        const shiftInvoices = await Invoice.find(query);

        // Send the filtered data to your telegramReport logic
        await sendDailyReport(shiftInvoices);
        res.status(200).json({ message: `Shift report for ${username} sent!` });
    } catch (error) {
        console.error("Shift Report Error:", error);
        res.status(500).json({ error: "Failed to send shift report" });
    }
});
app.get("/", (req, res) => {
    res.send("✅ POS Backend is Running! (Access the App via your GitHub Pages URL)");
});

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// --- AUTOMATIC 12AM RATE UPDATER ---
setInterval(async () => {
    try {
        const settings = await Settings.findOne();
        if (settings && settings.pendingExchangeRate && settings.rateEffectiveAt) {
            const now = new Date();
            if (now >= settings.rateEffectiveAt) {
                console.log(`🕛 12AM REACHED: Updating Exchange Rate from ${settings.exchangeRate} to ${settings.pendingExchangeRate}`);
                settings.exchangeRate = settings.pendingExchangeRate;
                settings.pendingExchangeRate = undefined;
                settings.rateEffectiveAt = undefined;
                await settings.save();
            }
        }
    } catch (err) {
        console.error("Auto-Update Error:", err);
    }
}, 60000); 

/* ================== START SERVER ================== */

// 📌 ADDED: server.listen instead of app.listen to make Socket.IO work!
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`🚀 POS server running at http://localhost:${PORT}`);
    console.log(`👨‍💼 Admin panel at http://localhost:${PORT}/admin`);
    console.log(`🐛 Debug endpoint at http://localhost:${PORT}/api/debug`);
    console.log(`🟢 Real-Time Socket.IO Connected!`);
});