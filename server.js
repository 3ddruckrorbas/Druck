const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// --- KONFIGURATION ---
const FORMSPREE_URL = "https://formspree.io/f/xjgevaln"; 

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'database.json');
const FILAMENTS_FILE = path.join(__dirname, 'filaments.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const BANNED_FILE = path.join(__dirname, 'banned_ids.json');
const TEMPLATES_FILE = path.join(__dirname, 'templates.json');

// Default Filaments (Initial Seed)
const DEFAULT_FILAMENTS = [
    { id: '1', name: 'PLA Schwarz', color: 'Schwarz', colorHex: '#1a1a1a', material: 'PLA', inStock: true, pricePer100g: 4.50, fixedPriceUnder50g: 5.00 },
    { id: '2', name: 'PETG Schwarz', color: 'Schwarz', colorHex: '#000000', material: 'PETG', inStock: true, pricePer100g: 5.00, fixedPriceUnder50g: 6.00 },
    { id: '3', name: 'PLA Weiß', color: 'Weiß', colorHex: '#f5f5f5', material: 'PLA', inStock: true, pricePer100g: 4.50, fixedPriceUnder50g: 5.00 },
    { id: '4', name: 'PLA Gold', color: 'Gold', colorHex: '#d4af37', material: 'PLA', inStock: true, pricePer100g: 5.50, fixedPriceUnder50g: 7.00 },
    { id: '5', name: 'PLA Grau', color: 'Grau', colorHex: '#888888', material: 'PLA', inStock: true, pricePer100g: 4.50, fixedPriceUnder50g: 5.00 },
    { id: '6', name: 'PLA Teak Wood', color: 'Teak Wood', colorHex: '#8B4513', material: 'PLA', inStock: true, pricePer100g: 6.00, fixedPriceUnder50g: 8.00 },
    { id: '7', name: 'PLA Black Walnut', color: 'Walnut', colorHex: '#C49A6C', material: 'PLA', inStock: true, pricePer100g: 6.00, fixedPriceUnder50g: 8.00 },
    { id: '8', name: 'TPU A95 Rot', color: 'Rot', colorHex: '#dc2626', material: 'TPU', inStock: true, pricePer100g: 7.50, fixedPriceUnder50g: 10.00 },
    { id: '9', name: 'TPU A95 Hellgrün', color: 'Hellgrün', colorHex: '#00B08B', material: 'TPU', inStock: true, pricePer100g: 7.50, fixedPriceUnder50g: 10.00 },
    { id: '10', name: 'PETG Signalblau', color: 'Blau', colorHex: '#2563eb', material: 'PETG', inStock: true, pricePer100g: 5.00, fixedPriceUnder50g: 6.00 },
    { id: '11', name: 'PETG Transparent', color: 'Klar', colorHex: '#E5E7EB', material: 'PETG', inStock: false, pricePer100g: 5.00, fixedPriceUnder50g: 6.00 },
];

const DEFAULT_SETTINGS = {
    passwords: ['A1Carbon3d']
};

const DEFAULT_TEMPLATES = [];

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '.'))); // Serves index.html

// --- HELPERS ---

const generateId = () => {
    try {
        return crypto.randomUUID();
    } catch (e) {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
};

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
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`[File] Fehler beim Schreiben von ${filePath}:`, e.message);
    }
};

const sendEmail = async (subject, message) => {
    if (!FORMSPREE_URL || FORMSPREE_URL.includes("deine-id")) {
        console.log("Email Simulation (Log):", subject, message);
        return;
    }
    try {
        console.log(`[Email] Sende Versuch über Formspree: ${subject}`);
        await axios.post(FORMSPREE_URL, {
            subject: subject,
            message: message
        });
        console.log("[Email] Erfolgreich über Formspree gesendet");
    } catch (error) {
        console.error("[Email] Formspree Fehler:", error.message);
    }
};

// TEST ROUTE FÜR EMAIL
app.get('/api/test-email', async (req, res) => {
    try {
        await sendEmail("Test Email vom Server (Formspree)", "Dies ist eine Test-Nachricht, um die Formspree Verbindung zu prüfen.");
        res.json({ success: true, message: "Test-Email wurde getriggert. Prüfe dein Postfach." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
Geräte-Kennung (Device-ID): ${newOrder.deviceId || 'Unbekannt'}
    `.trim();

    await sendEmail(emailSubject, emailBody);

    res.status(201).json(newOrder);
});

app.post('/api/questions', async (req, res) => {
    const { message } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Unbekannt';
    const userAgent = req.headers['user-agent'] || 'Unbekannt';

    if (!message) {
        return res.status(400).json({ error: 'Nachricht ist erforderlich' });
    }

    const emailSubject = `Neue Frage von der Webseite`;
    const emailBody = `
Eine neue Frage ist über das AGB-Formular eingegangen!

Nachricht:
${message}

--- Metadaten ---
IP: ${ip}
Browser: ${userAgent}
Zeitpunkt: ${new Date().toLocaleString('de-CH')}
    `.trim();

    await sendEmail(emailSubject, emailBody);

    res.json({ success: true });
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
        id: generateId(),
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

// --- ROUTES: TEMPLATES ---

app.get('/api/templates', (req, res) => {
    const templates = readJsonFile(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    res.json(templates);
});

app.post('/api/templates', (req, res) => {
    const templates = readJsonFile(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    const newTemplate = {
        id: generateId(),
        ...req.body
    };
    templates.push(newTemplate);
    writeJsonFile(TEMPLATES_FILE, templates);
    res.status(201).json(templates);
});

app.put('/api/templates/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    let templates = readJsonFile(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    
    templates = templates.map(t => t.id === id ? { ...t, ...updates } : t);
    
    writeJsonFile(TEMPLATES_FILE, templates);
    res.json(templates);
});

app.delete('/api/templates/:id', (req, res) => {
    const { id } = req.params;
    let templates = readJsonFile(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    templates = templates.filter(t => t.id !== id);
    writeJsonFile(TEMPLATES_FILE, templates);
    res.json(templates);
});

// --- ROUTES: SETTINGS / AUTH ---

app.post('/api/auth/login', async (req, res) => {
    const { password, deviceId } = req.body;
    const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    
    if (settings.passwords.includes(password)) {
        return res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Ungültiges Passwort' });
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

// --- ROUTES: BAN MANAGEMENT ---

app.get('/api/banned', (req, res) => {
    const banned = readJsonFile(BANNED_FILE, []);
    res.json(banned);
});

app.post('/api/banned', (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Device ID erforderlich' });
    
    let banned = readJsonFile(BANNED_FILE, []);
    if (!banned.includes(deviceId)) {
        banned.push(deviceId);
        writeJsonFile(BANNED_FILE, banned);
    }
    res.json(banned);
});

app.delete('/api/banned/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    let banned = readJsonFile(BANNED_FILE, []);
    banned = banned.filter(id => id !== deviceId);
    writeJsonFile(BANNED_FILE, banned);
    res.json(banned);
});

// Fallback: Serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
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
    if (!fs.existsSync(BANNED_FILE)) {
        writeJsonFile(BANNED_FILE, []);
    }
    if (!fs.existsSync(TEMPLATES_FILE)) {
        writeJsonFile(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    }
});
