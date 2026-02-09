const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.'))); // Serves index.html

// Helper: Read Data
const readData = () => {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    const data = fs.readFileSync(DATA_FILE);
    return JSON.parse(data);
};

// Helper: Write Data
const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// API Routes

// 1. Get All Orders (or filter by deviceId)
app.get('/api/orders', (req, res) => {
    const orders = readData();
    const { deviceId } = req.query;

    if (deviceId) {
        const filtered = orders.filter(o => o.deviceId === deviceId);
        // Sort newest first
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json(filtered);
    }

    // Return all (for Admin)
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
});

// 2. Create Order
app.post('/api/orders', (req, res) => {
    const orders = readData();
    const newOrder = {
        id: crypto.randomUUID(), // Node.js 19+ or simple polyfill below
        createdAt: new Date().toISOString(),
        status: 'pending',
        adminNotes: '',
        ...req.body
    };
    
    // Simple ID generator if crypto not available in older node envs
    if(!newOrder.id) {
        newOrder.id = Math.random().toString(36).substring(2, 15);
    }

    orders.push(newOrder);
    writeData(orders);
    res.status(201).json(newOrder);
});

// 3. Update Order (Status or Notes)
app.put('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    let orders = readData();
    
    let found = false;
    orders = orders.map(order => {
        if (order.id === id) {
            found = true;
            return { ...order, ...updates };
        }
        return order;
    });

    if (!found) {
        return res.status(404).json({ error: 'Order not found' });
    }

    writeData(orders);
    res.json(orders); // Return updated list
});

// 4. Delete Order
app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    let orders = readData();
    const initialLength = orders.length;
    
    orders = orders.filter(o => o.id !== id);

    if (orders.length === initialLength) {
        return res.status(404).json({ error: 'Order not found' });
    }

    writeData(orders);
    res.json(orders);
});

// Fallback: Serve index.html for any other route (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize DB file if not exists
    if (!fs.existsSync(DATA_FILE)) {
        writeData([]);
    }
});
