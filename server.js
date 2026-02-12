const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const dotenv = require("dotenv");

const connectDB = require("./config/db");
const mongoose = require("mongoose");

dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;
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
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. CREATE NEW USER
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, fullName, role } = req.body;
        
        // Validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and PIN are required' });
        }
        
        // Check duplicates
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: 'Operator ID already exists' });
        }

        const newUser = new User({ username, password, fullName, role });
        await newUser.save();
        
        res.status(201).json({ message: 'User created successfully', user: newUser });
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
        
        // Find user in database
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(401).json({ error: 'Operator ID not found' });
        }

        // Check PIN (password)
        // Note: In production, use bcrypt.compare()
        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid Security PIN' });
        }

        // Successful Login
        res.json({
            message: 'Login successful',
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
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
// PUBLIC SETTINGS ENDPOINT
app.get("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne().lean();
        if (!settings) {
            settings = { exchangeRate: 4000 }; 
        }
        
        // UPDATE THIS BLOCK to include receiptHeader & receiptFooter
        res.json({
            exchangeRate: settings.exchangeRate || 4000,
            currency: settings.currency || 'USD',
            taxRate: settings.taxRate || 0,
            // --- NEW FIELDS ---
            receiptHeader: settings.receiptHeader || "",
            receiptFooter: settings.receiptFooter || ""
        });
        
    } catch (error) {
        console.error('❌ /api/settings: Error:', error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});
// Invoice Schema
// Update Invoice Schema in server.js
const InvoiceSchema = new mongoose.Schema({
    invoiceId: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    table: { type: String, default: "0" },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    paymentMethod: { type: String, enum: ['cash', 'card', 'delivery'], default: 'cash' },
    items: [ItemSchema],
    subtotal: Number,
    discount: Number,
    total: Number,
    // --- NEW FIELD: Stores the rate at the exact moment of payment ---
    exchangeRate: { type: Number },  
    // ----------------------------------------------------------------
    createdBy: { type: String, default: 'cashier' },
    lastModifiedBy: { type: String },
    lastModifiedAt: { type: Date }
});
// Menu Schema - MODIFIED: Changed category to array
const MenuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    categories: { 
        type: [String], // Changed from String to [String]
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
    password: { type: String, required: true }, // 4-digit PIN
    fullName: { type: String },
    role: { type: String, enum: ['admin', 'cashier', 'staff'], default: 'cashier' },
    createdAt: { type: Date, default: Date.now }
});



// Category Schema
const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Settings Schema
const SettingsSchema = new mongoose.Schema({
    // ... existing fields ...
    storeName: { type: String, default: 'Paint Coffee' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    wifiPassword: { type: String, default: '' },
    receiptHeader: { type: String },
    receiptFooter: { type: String },
    receiptLogo: { type: String },
    
    exchangeRate: { type: Number, default: 4000 }, // The CURRENT active rate
    
    // --- ADD THESE TWO FIELDS ---
    pendingExchangeRate: { type: Number }, // The rate waiting for 12AM
    rateEffectiveAt: { type: Date }        // The time (12AM) it becomes active
    // ----------------------------
}, { timestamps: true });

// Create Models
const Invoice = mongoose.model("Invoice", InvoiceSchema);
const MenuItem = mongoose.model("MenuItem", MenuSchema);
const User = mongoose.model("User", UserSchema);
const Category = mongoose.model("Category", CategorySchema);
const Settings = mongoose.model("Settings", SettingsSchema);

/* ================== INITIAL DATA SETUP ================== */

// In server.js, replace the initializeData function with:

async function initializeData() {
    try {
        console.log('🔄 Initializing database...');
        
        // Create default admin user if not exists
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const adminUser = new User({
                username: 'admin',
                email: 'admin@restaurant.com',
                password: 'admin123',
                role: 'admin',
                status: 'active'
            });
            await adminUser.save();
            console.log('✅ Default admin user created');
        }

        // ⚠️ REMOVED: Auto-creation of default categories
        // Categories should be created manually through the admin panel
        console.log('ℹ️ Categories will not be created automatically. Use admin panel to create categories.');

        // Check if we have any menu items
        const menuItemsCount = await MenuItem.countDocuments();
        console.log(`📊 Current menu items count: ${menuItemsCount}`);
        
        if (menuItemsCount === 0) {
            console.log('ℹ️ No menu items found. Admin must add items through the admin panel.');
        }

        // Create default settings if not exist
        const settingsExist = await Settings.findOne();
        if (!settingsExist) {
            const defaultSettings = new Settings({});
            await defaultSettings.save();
            console.log('✅ Default settings created');
        }

        // Initialize counter if not exists
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

// Initialize data after connection
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
        // Fallback to timestamp-based ID
        const timestamp = Date.now().toString().slice(-6);
        return `INV-${timestamp}`;
    }
};

/* ================== FRONTEND ================== */

const frontendPath = path.join(__dirname, "../frontEnd");
app.use(express.static(frontendPath));

/* ================== PUBLIC API ROUTES ================== */
// PUBLIC SETTINGS ENDPOINT
app.get("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne().lean();
        if (!settings) {
            settings = { exchangeRate: 4000 }; 
        }
        
        // UPDATE THIS BLOCK to include receiptHeader & receiptFooter
        res.json({
            exchangeRate: settings.exchangeRate || 4000,
            currency: settings.currency || 'USD',
            taxRate: settings.taxRate || 0,
            // --- NEW FIELDS ---
            receiptHeader: settings.receiptHeader || "",
            receiptFooter: settings.receiptFooter || "",
            receiptLogo: settings.receiptLogo || ""
        });
        
    } catch (error) {
        console.error('❌ /api/settings: Error:', error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});
app.put('/api/settings', authenticate, async (req, res) => {
    try {
        const updates = req.body;
        
        // 1. Check if Exchange Rate is being changed
        if (updates.exchangeRate) {
            const currentSettings = await Settings.findOne();
            const newRate = parseFloat(updates.exchangeRate);

            // Only schedule if it's actually different
            if (currentSettings && currentSettings.exchangeRate !== newRate) {
                
                // Calculate next 12:00 AM (Midnight)
                const nextMidnight = new Date();
                nextMidnight.setHours(24, 0, 0, 0); // Sets time to 00:00:00 tomorrow

                // Save as PENDING, do not update current rate yet
                updates.pendingExchangeRate = newRate;
                updates.rateEffectiveAt = nextMidnight;
                
                // REMOVE exchangeRate from updates so it doesn't change now
                delete updates.exchangeRate; 
                
                console.log(`⏳ Rate Change Scheduled: ${newRate} to apply at ${nextMidnight}`);
            }
        }

        // 2. Apply updates
        const settings = await Settings.findOneAndUpdate(
            {}, 
            { $set: updates },
            { new: true, upsert: true } // Return the updated doc
        );
        
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUBLIC MENU ENDPOINT - returns only active items
app.get("/api/menu", async (req, res) => {
    try {
        console.log('📋 /api/menu: Fetching all ACTIVE menu items');
        
        const menu = await MenuItem.find({ isActive: true })
            .sort({ name: 1 })
            .lean();
        
        console.log(`✅ /api/menu: Found ${menu.length} active menu items`);
        
        const transformedMenu = menu.map(item => {
            const itemId = item._id ? item._id.toString() : item.id;
            // Ensure categories is always an array
            const categoriesList = Array.isArray(item.categories) && item.categories.length > 0 
                ? item.categories 
                : (item.category ? [item.category] : ['Uncategorized']);

            return {
                ...item,
                id: itemId,
                _id: itemId,
                // Primary category for display purposes
                category: categoriesList[0],
                // Full list for filtering
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

// PUBLIC CATEGORIES ENDPOINT
app.get("/api/categories", async (req, res) => {
    try {
        console.log('📋 /api/categories: Fetching all categories');
        const categories = await Category.find().sort({ name: 1 }).lean();
        console.log(`✅ /api/categories: Found ${categories.length} categories`);
        
        // Return just the category names as array of strings
        const categoryNames = categories.map(cat => cat.name);
        res.json(categoryNames);
    } catch (error) {
        console.error('❌ /api/categories: Error:', error);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});
// Debug endpoint for menu items
app.get("/api/debug/menu", async (req, res) => {
    try {
        console.log('🐛 /api/debug/menu: Debug endpoint called');
        
        const totalItems = await MenuItem.countDocuments();
        const activeItems = await MenuItem.countDocuments({ isActive: true });
        const inactiveItems = await MenuItem.countDocuments({ isActive: false });
        
        const sampleItems = await MenuItem.find().limit(5).lean();
        
        // Group by category
        const byCategory = await MenuItem.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            counts: {
                total: totalItems,
                active: activeItems,
                inactive: inactiveItems
            },
            sampleItems: sampleItems.map(item => ({
                name: item.name,
                category: item.category,
                isActive: item.isActive,
                originalPrice: item.originalPrice,
                id: item._id
            })),
            byCategory: byCategory,
            collections: await mongoose.connection.db.listCollections().toArray()
        });
        
    } catch (error) {
        console.error('❌ /api/debug/menu: Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Remove the getSampleMenuData function entirely

// Helper function for sample menu data
function getSampleMenuData() {
    return [
        {
            id: '1',
            _id: '1',
            name: 'Coca-Cola',
            originalPrice: 2.50,
            category: 'Drink',
            type: 'Cold',
            isPromo: false,
            isActive: true,
            image: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=200&h=130&fit=crop'
        },
        {
            id: '2',
            _id: '2',
            name: 'Pepsi',
            originalPrice: 2.50,
            category: 'Drink',
            type: 'Cold',
            isPromo: true,
            promoPrice: 2.00,
            badge: 'PROMO',
            isActive: true,
            image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=130&fit=crop'
        },
        {
            id: '3',
            _id: '3',
            name: 'Burger',
            originalPrice: 8.99,
            category: 'Food',
            type: 'Hot',
            isPromo: false,
            isActive: true,
            image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=130&fit=crop'
        },
        {
            id: '4',
            _id: '4',
            name: 'French Fries',
            originalPrice: 3.99,
            category: 'Food',
            type: 'Hot',
            isPromo: true,
            promoPrice: 2.99,
            badge: 'SALE',
            isActive: true,
            image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=200&h=130&fit=crop'
        }
    ];
}
// Add this endpoint for admin to add sample items if needed
app.post("/api/admin/menu/add-defaults", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/menu/add-defaults: Adding default menu items');
        
        // First, check if we have any categories in the database
        const categoryCount = await Category.countDocuments();
        
        if (categoryCount === 0) {
            return res.status(400).json({
                success: false,
                error: "No categories found. Please create categories in 'Manage Categories' first."
            });
        }
        
        // Get existing categories
        const existingCategories = await Category.find().lean();
        const categoryNames = existingCategories.map(cat => cat.name);
        
        console.log('Available categories:', categoryNames);
        
        // Default menu items (without hardcoded categories)
        const defaultMenuItems = [
            {
                name: "Coca-Cola",
                originalPrice: 2.50,
                category: categoryNames.includes("Drink") ? "Drink" : categoryNames[0], // Use first available category
                type: "Cold",
                isPromo: false,
                isActive: true,
                image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=200&h=130&fit=crop"
            },
            {
                name: "Pepsi",
                originalPrice: 2.50,
                category: categoryNames.includes("Drink") ? "Drink" : categoryNames[0],
                type: "Cold",
                isPromo: true,
                promoPrice: 2.00,
                badge: "PROMO",
                isActive: true,
                image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=130&fit=crop"
            },
            {
                name: "Burger",
                originalPrice: 8.99,
                category: categoryNames.includes("Food") ? "Food" : categoryNames[0],
                type: "Hot",
                isPromo: false,
                isActive: true,
                image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=130&fit=crop"
            },
            {
                name: "French Fries",
                originalPrice: 3.99,
                category: categoryNames.includes("Food") ? "Food" : categoryNames[0],
                type: "Hot",
                isPromo: true,
                promoPrice: 2.99,
                badge: "SALE",
                isActive: true,
                image: "https://images.unsplash.com/photo-1576107232684-1279f390859f?w=200&h=130&fit=crop"
            }
        ];
        
        // Check which items don't exist yet
        const existingItems = await MenuItem.find({
            name: { $in: defaultMenuItems.map(item => item.name) }
        });
        
        const existingNames = existingItems.map(item => item.name);
        const itemsToAdd = defaultMenuItems.filter(item => !existingNames.includes(item.name));
        
        if (itemsToAdd.length === 0) {
            return res.json({
                success: true,
                message: "All default items already exist",
                added: 0
            });
        }
        
        // Validate that all items have valid categories
        const invalidItems = itemsToAdd.filter(item => !categoryNames.includes(item.category));
        if (invalidItems.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Some items have invalid categories. Available categories: ${categoryNames.join(', ')}`
            });
        }
        
        await MenuItem.insertMany(itemsToAdd);
        
        console.log(`✅ Added ${itemsToAdd.length} default menu items`);
        res.json({
            success: true,
            message: `Added ${itemsToAdd.length} default menu items`,
            added: itemsToAdd.length,
            items: itemsToAdd.map(item => item.name),
            warning: categoryNames.length === 1 ? `All items assigned to "${categoryNames[0]}" category. Add more categories for better organization.` : null
        });
        
    } catch (error) {
        console.error('❌ Error adding default menu items:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Debug endpoint for categories
app.get("/api/debug/categories", async (req, res) => {
    try {
        console.log('🐛 /api/debug/categories: Debug endpoint called');
        
        const categories = await Category.find().sort({ name: 1 }).lean();
        
        res.json({
            success: true,
            isArray: Array.isArray(categories),
            count: categories.length,
            categories: categories,
            collectionExists: true
        });
        
    } catch (error) {
        console.error('❌ /api/debug/categories: Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            isArray: false
        });
    }
});

app.get("/api/menu/category/:category", async (req, res) => {
    try {
        const { category } = req.params;
        console.log(`📋 /api/menu/category/${category}: Fetching items`);
        
        let filter = { isActive: true };
        
        if (category && category !== "All") {
            // Check if category exists in categories array
            filter = { 
                categories: category, // Search in categories array
                isActive: true 
            };
        }

        const menu = await MenuItem.find(filter)
            .sort({ name: 1 })
            .lean();

        console.log(`✅ /api/menu/category/${category}: Found ${menu.length} items`);
        
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
        console.error(`❌ /api/menu/category/${req.params.category}: Error:`, error);
        res.status(500).json({ error: "Failed to fetch menu" });
    }
});

app.get("/api/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 /api/menu/${id}: Fetching menu item`);
        
        const item = await MenuItem.findOne({
            $or: [
                { _id: id },
                { id: id }
            ],
            isActive: true
        }).lean();
        
        if (!item) {
            console.log(`❌ /api/menu/${id}: Menu item not found`);
            return res.status(404).json({ error: "Menu item not found" });
        }
        
        console.log(`✅ /api/menu/${id}: Found: ${item.name}`);
        
        // Transform data
        const itemId = item._id ? item._id.toString() : item.id;
        const transformedItem = {
            ...item,
            id: itemId,
            _id: itemId
        };
        
        res.json(transformedItem);
    } catch (error) {
        console.error(`❌ /api/menu/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to fetch menu item" });
    }
});
async function migrateToMultipleCategories() {
    try {
        console.log('🔄 Migrating to multiple categories...');
        
        const items = await MenuItem.find({});
        let updatedCount = 0;
        
        for (const item of items) {
            if (item.category && !item.categories) {
                // Move single category to categories array
                item.categories = [item.category];
                await item.save();
                updatedCount++;
                console.log(`Migrated: ${item.name} - ${item.category} -> ${item.categories.join(', ')}`);
            }
        }
        
        console.log(`✅ Migration complete: ${updatedCount} items updated`);
    } catch (error) {
        console.error('❌ Migration error:', error);
    }
}
// ====== INVOICE API ======
app.get("/api/invoices", async (req, res) => {
    try {
        console.log('📋 /api/invoices: Fetching all invoices');
        const invoices = await Invoice.find().sort({ date: -1 }).lean();
        console.log(`✅ /api/invoices: Found ${invoices.length} invoices`);
        res.json(invoices);
    } catch (error) {
        console.error('❌ /api/invoices: Error:', error);
        res.status(500).json({ error: "Failed to fetch invoices" });
    }
});

app.get("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 /api/invoices/${id}: Fetching invoice`);
        
        // Check if the ID is a valid MongoDB ObjectId
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && 
                          (mongoose.Types.ObjectId(id).toString() === id);
        
        let invoice;
        
        if (isObjectId) {
            // Search by MongoDB _id
            invoice = await Invoice.findById(id).lean();
        } else {
            // Search by invoiceId (string)
            invoice = await Invoice.findOne({ invoiceId: id }).lean();
        }
        
        if (!invoice) {
            console.log(`❌ /api/invoices/${id}: Invoice not found`);
            return res.status(404).json({ error: "Invoice not found" });
        }
        
        console.log(`✅ /api/invoices/${id}: Found: ${invoice.invoiceId}`);
        res.json(invoice);
    } catch (error) {
        console.error(`❌ /api/invoices/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to fetch invoice" });
    }
});

app.post("/api/invoices", async (req, res) => {
    try {
        console.log('📋 /api/invoices: Creating new invoice');
        const invoiceId = await generateInvoiceId();
        const invoiceData = {
            invoiceId,
            ...req.body,
            date: new Date()
        };
        
        const invoice = new Invoice(invoiceData);
        await invoice.save();
        
        console.log(`✅ /api/invoices: Created: ${invoiceId}`);
        res.status(201).json(invoice);
    } catch (err) {
        console.error('❌ /api/invoices: Error creating invoice:', err);
        res.status(500).json({ error: "Create invoice failed" });
    }
});

app.put("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 /api/invoices/${id}: Updating invoice`);
        
        // Check if the ID is a valid MongoDB ObjectId
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && 
                          (mongoose.Types.ObjectId(id).toString() === id);
        
        let query;
        
        if (isObjectId) {
            query = { _id: id };
        } else {
            query = { invoiceId: id };
        }
        
        // Get the current invoice first
        const existingInvoice = await Invoice.findOne(query);
        
        if (!existingInvoice) {
            console.log(`❌ /api/invoices/${id}: Invoice not found`);
            return res.status(404).json({ error: "Invoice not found" });
        }
        
        // Check permission: Cashiers can only edit pending invoices
        const isAdmin = req.headers['x-user-role'] === 'admin' || 
                       req.query.user_role === 'admin' ||
                       (req.body.user && req.body.user.role === 'admin');
        
        console.log(`Permission check: isAdmin=${isAdmin}, current status=${existingInvoice.status}`);
        
        if (!isAdmin && existingInvoice.status !== 'pending') {
            console.log(`❌ /api/invoices/${id}: Permission denied - only admins can edit non-pending invoices`);
            return res.status(403).json({ 
                error: "Permission denied. Only administrators can edit paid invoices." 
            });
        }
        
        // Update the invoice
        const updateData = {
            ...req.body,
            lastModifiedAt: new Date(),
            lastModifiedBy: isAdmin ? 'admin' : 'cashier'
        };
        
        const invoice = await Invoice.findOneAndUpdate(
            query,
            updateData,
            { new: true }
        ).lean();
        
        console.log(`✅ /api/invoices/${id}: Updated: ${invoice.invoiceId}`);
        res.json(invoice);
    } catch (error) {
        console.error(`❌ /api/invoices/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to update invoice" });
    }
});
// Add this to server.js for debugging
app.get("/api/debug/invoice/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && 
                          (mongoose.Types.ObjectId(id).toString() === id);
        
        res.json({
            id,
            isObjectId,
            objectIdTest: mongoose.Types.ObjectId.isValid(id),
            type: typeof id,
            length: id.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/invoices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 /api/invoices/${id}: Delete request received`);

        // Check if ID is valid
        const isObjectId = mongoose.Types.ObjectId.isValid(id);
        const query = isObjectId ? { _id: id } : { invoiceId: id };

        // 1. Find the invoice first to check its current status
        const invoice = await Invoice.findOne(query);

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // 2. LOGIC: Two-Stage Deletion
        if (invoice.status === 'cancelled') {
            // CASE A: Already Cancelled -> PERMANENT DELETE (Hard Delete)
            await Invoice.deleteOne(query);
            console.log(`✅ /api/invoices/${id}: Permanently deleted from database`);
            return res.json({ message: "Invoice permanently deleted", id: id, type: 'hard' });
        } else {
            // CASE B: Active (Paid/Pending) -> SOFT DELETE (Mark as Cancelled)
            invoice.status = 'cancelled';
            invoice.lastModifiedAt = new Date();
            await invoice.save();
            
            console.log(`✅ /api/invoices/${id}: Soft deleted (Marked as Cancelled)`);
            return res.json({ message: "Invoice marked as deleted", invoice: invoice, type: 'soft' });
        }

    } catch (error) {
        console.error(`❌ /api/invoices/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to delete invoice" });
    }
});
/* ================== ADMIN API ROUTES ================== */

// ====== MENU ITEMS MANAGEMENT ======
app.get("/api/admin/menu", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/menu: Fetching all menu items');
        const items = await MenuItem.find().sort({ createdAt: -1 }).lean();
        console.log(`✅ /api/admin/menu: Found ${items.length} items`);
        
        // Transform data
        const transformedItems = items.map(item => {
            const itemId = item._id ? item._id.toString() : item.id;
            return {
                ...item,
                id: itemId,
                _id: itemId
            };
        });
        
        res.json(transformedItems);
    } catch (error) {
        console.error('❌ /api/admin/menu: Error:', error);
        res.status(500).json({ error: "Failed to fetch menu items" });
    }
});

app.get("/api/admin/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/menu/${id}: Fetching menu item`);
        
        const item = await MenuItem.findById(id).lean();
        if (!item) {
            console.log(`❌ /api/admin/menu/${id}: Menu item not found`);
            return res.status(404).json({ error: "Item not found" });
        }
        
        console.log(`✅ /api/admin/menu/${id}: Found: ${item.name}`);
        
        // Transform data
        const itemId = item._id ? item._id.toString() : item.id;
        const transformedItem = {
            ...item,
            id: itemId,
            _id: itemId
        };
        
        res.json(transformedItem);
    } catch (error) {
        console.error(`❌ /api/admin/menu/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to fetch item" });
    }
});

// In the POST /api/admin/menu endpoint
// In the POST /api/admin/menu endpoint
app.post("/api/admin/menu", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/menu: Creating new menu item');
        
        const { name, categories, originalPrice } = req.body;
        
        // Validate required fields
        if (!name || !categories || !originalPrice) {
            return res.status(400).json({ 
                error: "Name, categories, and price are required" 
            });
        }
        
        // Ensure categories is an array
        const categoriesArray = Array.isArray(categories) ? categories : [categories];
        
        if (categoriesArray.length === 0) {
            return res.status(400).json({ 
                error: "At least one category is required" 
            });
        }
        
        // Check if ANY categories exist
        const categoryCount = await Category.countDocuments();
        if (categoryCount === 0) {
            return res.status(400).json({ 
                error: "No categories exist. Please create categories in 'Manage Categories' first." 
            });
        }
        
        // Validate all categories exist in database
        const allCategories = await Category.find().lean();
        const existingCategoryNames = allCategories.map(c => c.name);
        
        const invalidCategories = categoriesArray.filter(cat => 
            !existingCategoryNames.includes(cat)
        );
        
        if (invalidCategories.length > 0) {
            return res.status(400).json({ 
                error: `Categories "${invalidCategories.join(', ')}" do not exist. Available categories: ${existingCategoryNames.join(', ')}` 
            });
        }
        
        const itemData = {
            ...req.body,
            categories: categoriesArray, // Use the array
            isActive: true,
            createdAt: new Date()
        };
        
        const item = new MenuItem(itemData);
        await item.save();
        
        console.log(`✅ /api/admin/menu: Created: ${item.name} (Categories: ${item.categories.join(', ')})`);
        res.status(201).json(item);
        
    } catch (error) {
        console.error('❌ /api/admin/menu: Error creating item:', error);
        res.status(500).json({ 
            error: "Failed to create menu item", 
            details: error.message 
        });
    }
});
// Test endpoint to debug categories
app.get("/api/categories/test", async (req, res) => {
    try {
        console.log('🔍 /api/categories/test: Testing categories endpoint');
        
        // Check database connection
        const dbState = mongoose.connection.readyState;
        const dbStateName = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        }[dbState] || 'unknown';
        
        // Check if categories collection exists
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        const hasCategoriesCollection = collectionNames.includes('categories');
        
        // Count categories
        const categoryCount = await Category.countDocuments();
        
        // Get all categories
        const categories = await Category.find().lean();
        
        res.json({
            success: true,
            database: {
                state: dbState,
                stateName: dbStateName,
                collections: collectionNames,
                hasCategoriesCollection: hasCategoriesCollection
            },
            categories: {
                count: categoryCount,
                data: categories,
                names: categories.map(c => c.name)
            }
        });
        
    } catch (error) {
        console.error('❌ /api/categories/test: Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// In the PUT /api/admin/menu/:id endpoint
app.put("/api/admin/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/menu/${id}: Updating menu item`);
        
        // If categories are being updated, validate them
        if (req.body.categories) {
            const categoriesArray = Array.isArray(req.body.categories) 
                ? req.body.categories 
                : [req.body.categories];
            
            // Validate each category exists
            const allCategories = await Category.find().lean();
            const existingCategoryNames = allCategories.map(c => c.name);
            
            const invalidCategories = categoriesArray.filter(cat => 
                !existingCategoryNames.includes(cat)
            );
            
            if (invalidCategories.length > 0) {
                return res.status(400).json({ 
                    error: `Categories "${invalidCategories.join(', ')}" do not exist. Please create them in Manage Categories first.` 
                });
            }
            
            // Update with array
            req.body.categories = categoriesArray;
        }
        
        const item = await MenuItem.findByIdAndUpdate(
            id,
            req.body,
            { new: true, runValidators: true }
        ).lean();
        
        if (!item) {
            console.log(`❌ /api/admin/menu/${id}: Menu item not found`);
            return res.status(404).json({ error: "Item not found" });
        }
        
        // FIX: Added (item.categories || []) to prevent crash if categories is missing
        console.log(`✅ /api/admin/menu/${id}: Updated: ${item.name} (Categories: ${(item.categories || []).join(', ')})`);
        res.json(item);
        
    } catch (error) {
        console.error(`❌ /api/admin/menu/${req.params.id}: Error:`, error);
        res.status(500).json({ 
            error: "Failed to update menu item", 
            details: error.message 
        });
    }
});

app.delete("/api/admin/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/menu/${id}: Deleting menu item`);
        
        const item = await MenuItem.findByIdAndDelete(id).lean();
        if (!item) {
            console.log(`❌ /api/admin/menu/${id}: Menu item not found`);
            return res.status(404).json({ error: "Item not found" });
        }
        
        console.log(`✅ /api/admin/menu/${id}: Deleted: ${item.name}`);
        res.json({ message: "Menu item deleted successfully" });
    } catch (error) {
        console.error(`❌ /api/admin/menu/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to delete menu item" });
    }
});

// ====== CATEGORIES MANAGEMENT ======
// ====== CATEGORIES MANAGEMENT ======
app.get("/api/admin/categories", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/categories: Fetching all categories');
        const categories = await Category.find().sort({ name: 1 }).lean();
        console.log(`✅ /api/admin/categories: Found ${categories.length} categories`);
        res.json(categories);
    } catch (error) {
        console.error('❌ /api/admin/categories: Error:', error);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});

app.post("/api/admin/categories", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/categories: Creating new category');
        
        const { name, description } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: "Category name is required" });
        }
        
        // Check if category already exists
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
        });
        
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }
        
        const category = new Category({
            name: name.trim(),
            description: description?.trim() || '',
            createdAt: new Date()
        });
        
        await category.save();
        
        console.log(`✅ /api/admin/categories: Created: ${category.name}`);
        res.status(201).json(category);
    } catch (error) {
        console.error('❌ /api/admin/categories: Error creating category:', error);
        res.status(500).json({ error: "Failed to create category", details: error.message });
    }
});

app.delete("/api/admin/categories/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/categories/${id}: Deleting category`);
        
        // Check if any menu items are using this category
        const menuItemsUsingCategory = await MenuItem.countDocuments({ 
            category: await getCategoryNameById(id) 
        });
        
        if (menuItemsUsingCategory > 0) {
            return res.status(400).json({ 
                error: `Cannot delete category. ${menuItemsUsingCategory} menu item(s) are using this category.` 
            });
        }
        
        const category = await Category.findByIdAndDelete(id).lean();
        if (!category) {
            console.log(`❌ /api/admin/categories/${id}: Category not found`);
            return res.status(404).json({ error: "Category not found" });
        }
        
        console.log(`✅ /api/admin/categories/${id}: Deleted: ${category.name}`);
        res.json({ message: "Category deleted successfully" });
    } catch (error) {
        console.error(`❌ /api/admin/categories/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to delete category" });
    }
});

// Helper function to get category name by ID
async function getCategoryNameById(id) {
    const category = await Category.findById(id);
    return category ? category.name : null;
}
// ====== PUBLIC CATEGORIES API ======
// PUBLIC CATEGORIES ENDPOINT - Make sure this exists
// PUBLIC CATEGORIES ENDPOINT - returns ONLY categories from database
// PUBLIC CATEGORIES ENDPOINT - Make sure this exists
// PUBLIC CATEGORIES ENDPOINT - FIXED VERSION
app.get("/api/categories", async (req, res) => {
    try {
        console.log('📋 /api/categories: Fetching all categories');
        
        // Get all categories from database
        const categories = await Category.find({})
            .sort({ name: 1 })
            .lean()
            .exec();
        
        console.log(`✅ /api/categories: Found ${categories.length} categories`);
        
        // If no categories, return empty array
        if (!categories || categories.length === 0) {
            console.log('⚠️ No categories found in database');
            return res.json([]);
        }
        
        // Extract just the names
        const categoryNames = categories
            .map(cat => cat.name)
            .filter(name => name && name.trim() !== '');
        
        console.log('Category names:', categoryNames);
        res.json(categoryNames);
        
    } catch (error) {
        console.error('❌ /api/categories: Error:', error);
        // Return empty array on error
        res.json([]);
    }
});
// Debug endpoint to test categories
app.get("/api/test/categories-debug", async (req, res) => {
    try {
        console.log('🔍 /api/test/categories-debug: Testing categories');
        
        // Check if collection exists
        const collections = await mongoose.connection.db.listCollections().toArray();
        const hasCategories = collections.some(c => c.name === 'categories');
        
        const categoryCount = await Category.countDocuments();
        const categories = await Category.find().lean();
        
        res.json({
            success: true,
            collectionExists: hasCategories,
            count: categoryCount,
            categories: categories,
            asArray: categories.map(c => c.name),
            collectionNames: collections.map(c => c.name)
        });
        
    } catch (error) {
        console.error('❌ /api/test/categories-debug: Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ====== USERS MANAGEMENT ======
app.get("/api/admin/users", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/users: Fetching all users');
        const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
        console.log(`✅ /api/admin/users: Found ${users.length} users`);
        res.json(users);
    } catch (error) {
        console.error('❌ /api/admin/users: Error:', error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.get("/api/admin/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/users/${id}: Fetching user`);
        
        const user = await User.findById(id).select("-password").lean();
        if (!user) {
            console.log(`❌ /api/admin/users/${id}: User not found`);
            return res.status(404).json({ error: "User not found" });
        }
        
        console.log(`✅ /api/admin/users/${id}: Found: ${user.username}`);
        res.json(user);
    } catch (error) {
        console.error(`❌ /api/admin/users/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

app.post("/api/admin/users", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/users: Creating new user');
        
        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ username: req.body.username }, { email: req.body.email }] 
        });
        
        if (existingUser) {
            console.log(`❌ /api/admin/users: User already exists: ${req.body.username}/${req.body.email}`);
            return res.status(400).json({ error: "Username or email already exists" });
        }
        
        const user = new User(req.body);
        await user.save();
        
        // Return user without password
        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;
        
        console.log(`✅ /api/admin/users: Created: ${user.username} (ID: ${user._id})`);
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        console.error('❌ /api/admin/users: Error creating user:', error);
        res.status(500).json({ error: "Failed to create user", details: error.message });
    }
});

app.put("/api/admin/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/users/${id}: Updating user`);
        
        // Remove password from update if present
        const updateData = { ...req.body };
        if (updateData.password) {
            delete updateData.password;
        }
        
        const user = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("-password");
        
        if (!user) {
            console.log(`❌ /api/admin/users/${id}: User not found`);
            return res.status(404).json({ error: "User not found" });
        }
        
        console.log(`✅ /api/admin/users/${id}: Updated: ${user.username}`);
        res.json(user);
    } catch (error) {
        console.error(`❌ /api/admin/users/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to update user", details: error.message });
    }
});

app.delete("/api/admin/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`👨‍💼 /api/admin/users/${id}: Deleting user`);
        
        const user = await User.findByIdAndDelete(id).lean();
        if (!user) {
            console.log(`❌ /api/admin/users/${id}: User not found`);
            return res.status(404).json({ error: "User not found" });
        }
        
        console.log(`✅ /api/admin/users/${id}: Deleted: ${user.username}`);
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error(`❌ /api/admin/users/${req.params.id}: Error:`, error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// ====== SETTINGS MANAGEMENT ======
app.get("/api/admin/settings", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/settings: Fetching settings');
        let settings = await Settings.findOne().lean();
        if (!settings) {
            console.log('⚠️ /api/admin/settings: No settings found, creating default');
            settings = new Settings({});
            await settings.save();
        }
        console.log('✅ /api/admin/settings: Settings fetched');
        res.json(settings);
    } catch (error) {
        console.error('❌ /api/admin/settings: Error:', error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

app.put("/api/admin/settings", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/settings: Updating settings');
        
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings(req.body);
        } else {
            Object.assign(settings, req.body);
            settings.updatedAt = new Date();
        }
        await settings.save();
        
        console.log('✅ /api/admin/settings: Updated');
        res.json(settings);
    } catch (error) {
        console.error('❌ /api/admin/settings: Error:', error);
        res.status(500).json({ error: "Failed to update settings", details: error.message });
    }
});

// ====== STATISTICS ======
app.get("/api/admin/stats", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/stats: Fetching statistics');
        
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
            { 
                $match: { 
                    status: "paid",
                    date: { $gte: today, $lt: tomorrow }
                }
            },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        
        const stats = {
            totalInvoices,
            todayInvoices,
            totalMenuItems,
            totalUsers,
            totalRevenue: totalRevenueResult[0]?.total || 0,
            todayRevenue: todayRevenueResult[0]?.total || 0
        };
        
        console.log('✅ /api/admin/stats: Fetched');
        res.json(stats);
    } catch (error) {
        console.error('❌ /api/admin/stats: Error:', error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// ====== RECENT ORDERS ======
app.get("/api/admin/orders/recent", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        console.log(`👨‍💼 /api/admin/orders/recent: Fetching recent orders (limit: ${limit})`);
        
        const orders = await Invoice.find()
            .sort({ date: -1 })
            .limit(limit)
            .lean();
        
        console.log(`✅ /api/admin/orders/recent: Fetched ${orders.length} orders`);
        res.json(orders);
    } catch (error) {
        console.error('❌ /api/admin/orders/recent: Error:', error);
        res.status(500).json({ error: "Failed to fetch recent orders" });
    }
});

// ====== ADMIN DASHBOARD SUMMARY ======
app.get("/api/admin/dashboard", async (req, res) => {
    try {
        console.log('👨‍💼 /api/admin/dashboard: Fetching dashboard data');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const [stats, recentOrders] = await Promise.all([
            (async () => {
                const todayStart = new Date(today);
                const todayEnd = new Date(today);
                todayEnd.setHours(23, 59, 59, 999);
                
                const yesterdayStart = new Date(yesterday);
                const yesterdayEnd = new Date(yesterday);
                yesterdayEnd.setHours(23, 59, 59, 999);
                
                const [
                    totalInvoices,
                    todayInvoices,
                    yesterdayInvoices,
                    totalMenuItems,
                    activeUsers,
                    pendingInvoices
                ] = await Promise.all([
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
                    { 
                        $match: { 
                            status: "paid",
                            date: { $gte: todayStart, $lt: todayEnd }
                        }
                    },
                    { $group: { _id: null, total: { $sum: "$total" } } }
                ]);
                
                return {
                    totalInvoices,
                    todayInvoices,
                    yesterdayInvoices,
                    totalMenuItems,
                    activeUsers,
                    pendingInvoices,
                    totalRevenue: revenueResult[0]?.total || 0,
                    todayRevenue: todayRevenueResult[0]?.total || 0
                };
            })(),
            
            // Get recent orders
            Invoice.find().sort({ date: -1 }).limit(5).lean()
        ]);
        
        console.log('✅ /api/admin/dashboard: Fetched');
        res.json({
            stats,
            recentOrders
        });
    } catch (error) {
        console.error('❌ /api/admin/dashboard: Error:', error);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});

/* ================== DEBUG ENDPOINTS ================== */

// Debug endpoint to check database status
app.get("/api/debug", async (req, res) => {
    try {
        console.log('🐛 /api/debug: Debug endpoint called');
        
        const results = {
            mongodb: {
                state: mongoose.connection.readyState,
                stateName: mongoose.connection.readyState === 0 ? 'disconnected' :
                          mongoose.connection.readyState === 1 ? 'connected' :
                          mongoose.connection.readyState === 2 ? 'connecting' :
                          mongoose.connection.readyState === 3 ? 'disconnecting' : 'unknown'
            },
            collections: {
                menuItems: await MenuItem.countDocuments(),
                invoices: await Invoice.countDocuments(),
                users: await User.countDocuments(),
                categories: await Category.countDocuments()
            },
            server: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            }
        };
        
        console.log('✅ /api/debug: Results:', results);
        res.json(results);
    } catch (error) {
        console.error('❌ /api/debug: Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint for menu items
app.get("/api/test/menu", async (req, res) => {
    try {
        console.log('🧪 /api/test/menu: Testing menu endpoint');
        
        // Check collection exists
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        const hasMenuItems = collectionNames.includes('menuitems');
        
        if (!hasMenuItems) {
            console.log('⚠️ /api/test/menu: menuitems collection not found');
            return res.json({
                success: false,
                message: 'menuitems collection not found',
                collections: collectionNames
            });
        }
        
        // Try to get items
        const items = await MenuItem.find({ isActive: true }).limit(5).lean();
        
        console.log(`✅ /api/test/menu: Found ${items.length} items`);
        
        res.json({
            success: true,
            collectionExists: true,
            itemCount: await MenuItem.countDocuments({ isActive: true }),
            sampleItems: items.map(item => ({
                name: item.name,
                _id: item._id,
                id: item.id,
                category: item.category,
                isActive: item.isActive
            })),
            allCollections: collectionNames
        });
        
    } catch (error) {
        console.error('❌ /api/test/menu: Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

/* ================== SPA ROUTING ================== */

app.get("/", (req, res) => {
    console.log('🌐 Serving POS interface');
    res.sendFile(path.join(frontendPath, "pos.html"));
});

app.get("/admin", (req, res) => {
    console.log('🌐 Serving Admin interface');
    res.sendFile(path.join(frontendPath, "admin.html"));
});

app.get("*", (req, res) => {
    console.log('🌐 Serving POS interface (catch-all)');
    res.sendFile(path.join(frontendPath, "pos.html"));
});

/* ================== ERROR HANDLING ================== */
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});
// --- AUTOMATIC 12AM RATE UPDATER ---
// Checks every 60 seconds if we passed the effective time
setInterval(async () => {
    try {
        const settings = await Settings.findOne();
        
        // If we have a pending rate AND the time has passed (it is now after 12AM)
        if (settings && settings.pendingExchangeRate && settings.rateEffectiveAt) {
            const now = new Date();
            
            if (now >= settings.rateEffectiveAt) {
                console.log(`🕛 12AM REACHED: Updating Exchange Rate from ${settings.exchangeRate} to ${settings.pendingExchangeRate}`);
                
                // Apply the new rate
                settings.exchangeRate = settings.pendingExchangeRate;
                
                // Clear the pending data
                settings.pendingExchangeRate = undefined;
                settings.rateEffectiveAt = undefined;
                
                await settings.save();
            }
        }
    } catch (err) {
        console.error("Auto-Update Error:", err);
    }
}, 60000); // Run every 1 minute
/* ================== START SERVER ================== */

app.listen(PORT, () => {
    console.log(`🚀 POS server running at http://localhost:${PORT}`);
    console.log(`👨‍💼 Admin panel at http://localhost:${PORT}/admin`);
    console.log(`🐛 Debug endpoint at http://localhost:${PORT}/api/debug`);
    console.log(`🧪 Test menu endpoint at http://localhost:${PORT}/api/test/menu`);
});