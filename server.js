const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- KONFIGURATION ---
// HIER DEINE FORMSPREE URL EINFÜGEN!
const FORMSPREE_URL = "https://formspree.io/f/xjgevaln"; 

const WHITELISTED_DEVICES = ['7e4cf2', '8ff9a9', '0c6f21', '8bd4f8'];

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'database.json');
const FILAMENTS_FILE = path.join(__dirname, 'filaments.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// In-Memory Storage for 2FA Codes (Map: deviceId -> { code, expires })
const pending2FA = new Map();

// Default Filaments (Initial Seed)
const DEFAULT_FILAMENTS = [
    { id: '1', name: 'PLA Schwarz', color: 'Schwarz', colorHex: '#1a1a1a', material: 'PLA', inStock: true },
    { id: '2', name: 'PETG Schwarz', color: 'Schwarz', colorHex: '#000000', material: 'PETG', inStock: true },
    { id: '3', name: 'PLA Weiß', color: 'Weiß', colorHex: '#f5f5f5', material: 'PLA', inStock: true },
    { id: '4', name: 'PLA Gold', color: 'Gold', colorHex: '#d4af37', material: 'PLA', inStock: true },
    { id: '5', name: 'PLA Grau', color: 'Grau', colorHex: '#888888', material: 'PLA', inStock: true },
    { id: '6', name: 'PLA Teak Wood', color: 'Teak Wood', colorHex: '#8B4513', material: 'PLA', inStock: true },
    { id: '7', name: 'PLA Black Walnut', color: 'Walnut', colorHex: '#C49A6C', material: 'PLA', inStock: true },
    { id: '8', name: 'TPU A95 Rot', color: 'Rot', colorHex: '#dc2626', material: 'TPU', inStock: true },
    { id: '9', name: 'TPU A95 Hellgrün', color: 'Hellgrün', colorHex: '#00B08B', material: 'TPU', inStock: true },
    { id: '10', name: 'PETG Signalblau', color: 'Blau', colorHex: '#2563eb', material: 'PETG', inStock: true },
    { id: '11', name: 'PETG Transparent', color: 'Klar', colorHex: '#E5E7EB', material: 'PETG', inStock: false },
];

const DEFAULT_SETTINGS = {
    passwords: ['A1Carbon3d']
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.'))); // Serves index.html

// --- HELPERS ---

const readJsonFile = (filePath, defaultValue = []) => {
    if (!fs.existsSync(filePath)) {
        return defaultValue;
    }
    try {
        const data = fs.readFileSync(filePath);
        return JSON.parse(data);
    } catch (e) {
        return defaultValue;
    }
};

const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const sendEmail = async (subject, message) => {
    if (!FORMSPREE_URL || FORMSPREE_URL.includes("deine-id")) {
        console.log("Email Simulation (Log):", subject, message);
        return;
    }
    try {
        await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: subject,
                message: message
            })
        });
    } catch (error) {
        console.error("Formspree Error:", error);
    }
};

// --- ROUTES: ORDERS ---

app.get('/api/orders', (req, res) => {
    const orders = readJsonFile(DATA_FILE);
    const { deviceId } = req.query;

    if (deviceId) {
        const filtered = orders.filter(o => o.deviceId === deviceId);
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json(filtered);
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
});

app.post('/api/orders', async (req, res) => {
    const orders = readJsonFile(DATA_FILE);
    const newOrder = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        adminNotes: '',
        ...req.body
    };
    
    orders.push(newOrder);
    writeJsonFile(DATA_FILE, orders);

    // E-Mail Benachrichtigung senden
    const emailSubject = `Neue Bestellung von ${newOrder.userName}`;
    const emailBody = `
Ein neuer Auftrag ist eingegangen!

Kunde: ${newOrder.userName}
Email: ${newOrder.userEmail}
Telefon: ${newOrder.userPhone || 'Nicht angegeben'}

Beschreibung:
${newOrder.description}

Material:
${newOrder.material}

Lieferadresse:
${newOrder.street}
${newOrder.zip} ${newOrder.city}

Bestell-ID: ${newOrder.id}
    `.trim();

    await sendEmail(emailSubject, emailBody);

    res.status(201).json(newOrder);
});

app.put('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    let orders = readJsonFile(DATA_FILE);
    
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

    writeJsonFile(DATA_FILE, orders);
    res.json(orders);
});

app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    let orders = readJsonFile(DATA_FILE);
    const initialLength = orders.length;
    
    orders = orders.filter(o => o.id !== id);

    if (orders.length === initialLength) {
        return res.status(404).json({ error: 'Order not found' });
    }

    writeJsonFile(DATA_FILE, orders);
    res.json(orders);
});

// --- ROUTES: FILAMENTS ---

app.get('/api/filaments', (req, res) => {
    const filaments = readJsonFile(FILAMENTS_FILE, DEFAULT_FILAMENTS);
    res.json(filaments);
});

app.post('/api/filaments', (req, res) => {
    const filaments = readJsonFile(FILAMENTS_FILE, DEFAULT_FILAMENTS);
    const newFilament = {
        id: crypto.randomUUID(),
        inStock: true,
        ...req.body
    };
    filaments.push(newFilament);
    writeJsonFile(FILAMENTS_FILE, filaments);
    res.status(201).json(filaments);
});

app.put('/api/filaments/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    let filaments = readJsonFile(FILAMENTS_FILE, DEFAULT_FILAMENTS);
    
    filaments = filaments.map(f => f.id === id ? { ...f, ...updates } : f);
    
    writeJsonFile(FILAMENTS_FILE, filaments);
    res.json(filaments);
});

app.delete('/api/filaments/:id', (req, res) => {
    const { id } = req.params;
    let filaments = readJsonFile(FILAMENTS_FILE, DEFAULT_FILAMENTS);
    filaments = filaments.filter(f => f.id !== id);
    writeJsonFile(FILAMENTS_FILE, filaments);
    res.json(filaments);
});

// --- ROUTES: SETTINGS / AUTH ---

app.post('/api/auth/login', async (req, res) => {
    const { password, deviceId } = req.body;
    const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    
    if (settings.passwords.includes(password)) {
        // Password correct. Check whitelist.
        // Check if deviceId starts with any of the whitelisted IDs
        const isWhitelisted = deviceId && WHITELISTED_DEVICES.some(id => deviceId.startsWith(id));

        if (isWhitelisted) {
            return res.json({ success: true, require2FA: false });
        } else {
            // Generate 2FA Code
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expires = Date.now() + 60 * 60 * 1000; // 1 Hour

            pending2FA.set(deviceId, { code, expires });

            // Send Email via Formspree
            await sendEmail("Rorbas 3D Admin Login Code", `Dein Login-Code ist: ${code}`);

            return res.json({ success: true, require2FA: true });
        }
    } else {
        res.status(401).json({ success: false, error: 'Ungültiges Passwort' });
    }
});

app.post('/api/auth/verify', (req, res) => {
    const { code, deviceId } = req.body;
    const record = pending2FA.get(deviceId);

    if (!record) {
        return res.status(401).json({ success: false, error: 'Kein Code angefordert oder Session abgelaufen.' });
    }

    if (Date.now() > record.expires) {
        pending2FA.delete(deviceId);
        return res.status(401).json({ success: false, error: 'Code abgelaufen.' });
    }

    if (record.code === code) {
        pending2FA.delete(deviceId); // Consume code
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, error: 'Falscher Code.' });
    }
});

app.get('/api/admin/passwords', (req, res) => {
    const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    res.json(settings.passwords);
});

app.post('/api/admin/passwords', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({error: 'Passwort erforderlich'});
    
    const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    if (!settings.passwords.includes(password)) {
        settings.passwords.push(password);
        writeJsonFile(SETTINGS_FILE, settings);
    }
    res.json(settings.passwords);
});

app.delete('/api/admin/passwords/:password', (req, res) => {
    const { password } = req.params;
    let settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    
    // Prevent lockout: don't delete the last password
    if (settings.passwords.length <= 1 && settings.passwords.includes(password)) {
         return res.status(400).json({error: 'Das letzte Passwort kann nicht gelöscht werden.'});
    }

    const initialLength = settings.passwords.length;
    settings.passwords = settings.passwords.filter(p => p !== password);
    
    if (settings.passwords.length !== initialLength) {
         writeJsonFile(SETTINGS_FILE, settings);
    }
    
    res.json(settings.passwords);
});

// Fallback: Serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize DB files if not exist
    if (!fs.existsSync(DATA_FILE)) {
        writeJsonFile(DATA_FILE, []);
    }
    if (!fs.existsSync(FILAMENTS_FILE)) {
        writeJsonFile(FILAMENTS_FILE, DEFAULT_FILAMENTS);
    }
    if (!fs.existsSync(SETTINGS_FILE)) {
        writeJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    }
});
