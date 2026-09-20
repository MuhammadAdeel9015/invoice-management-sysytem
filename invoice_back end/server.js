require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { readStore, updateStore } = require('./storage');

// Promisified bcrypt helpers to avoid blocking the event loop
const bcryptHash = (password, saltRounds = 10) => new Promise((resolve, reject) => {
  bcrypt.hash(password, saltRounds, (err, hash) => err ? reject(err) : resolve(hash));
});

const bcryptCompare = (plain, hash) => new Promise((resolve, reject) => {
  bcrypt.compare(plain, hash, (err, res) => err ? reject(err) : resolve(res));
});

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the backend environment.');
}

// Bearer-token clients do not need cookies; wildcard CORS keeps Flutter clients working
// while allowing the separate browser admin panel to call the API.
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}
app.use('/uploads', express.static(uploadFolder));

// Auth Middleware
const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.toString().startsWith('Bearer ')
    ? header.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Admin Middleware
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== LOGIN ENDPOINT ====================
app.post('/login', async (req, res) => {
  try {
    const username = req.body.username?.toString().trim() ?? '';
    const password = req.body.password?.toString() ?? '';

    console.log('📍 POST /login received');
    console.log('   IP:', req.ip);
    console.log('   Login attempt received');

    // Validation
    if (!username || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        error: 'Missing credentials'
      });
    }

    const store = await readStore();
    const user = store.users.find((candidate) => candidate.username === username);
    console.log('   User found:', !!user);

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error: 'User not found'
      });
    }

    let passwordMatches = false;
    const storedPassword = user.password?.toString() ?? '';
    const looksHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');

    if (looksHashed) {
      passwordMatches = await bcryptCompare(password, storedPassword);
    } else {
      passwordMatches = password === storedPassword;
      if (passwordMatches) {
        // Upgrade plain-text password to bcrypt for better security (async)
        const newHash = await bcryptHash(password, 10);
        await updateStore((currentStore) => {
          const currentUser = currentStore.users.find((candidate) => candidate.id === user.id);
          if (currentUser) currentUser.password = newHash;
        });
        console.log('✓ Upgraded plain-text password to bcrypt for user:', username);
      }
    }

    if (!passwordMatches) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error: 'Password mismatch'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role || 'user'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✓ Login successful for user:', username);
    console.log('   Token created:', token.substring(0, 20) + '...');

    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'user'
      }
    });

  } catch (error) {
    console.error('❌ Login endpoint error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ==================== PROTECTED ENDPOINTS ====================
app.get('/api/invoices', auth, async (req, res) => {
  try {
    const { search, startDate, endDate, userId } = req.query;
    const store = await readStore();
    let results = store.invoices
      .filter((invoice) => req.user.role === 'admin' || invoice.user_id === req.user.id)
      .filter((invoice) => !userId || req.user.role !== 'admin' || invoice.user_id === Number(userId))
      .filter((invoice) => !search || [invoice.title, invoice.vendor, invoice.category]
        .some((value) => `${value || ''}`.toLowerCase().includes(search.toLowerCase())))
      .filter((invoice) => !startDate || invoice.invoice_date >= startDate.toString().split('T')[0])
      .filter((invoice) => !endDate || invoice.invoice_date <= endDate.toString().split('T')[0])
      .map((invoice) => ({
        ...invoice,
        user_name: store.users.find((user) => user.id === invoice.user_id)?.username || 'Unknown',
      }));
    const totalAmount = results.reduce(
      (sum, inv) => sum + parseFloat(inv.amount || 0),
      0,
    );
    res.json({ invoices: results, totalAmount });
  } catch (error) {
    console.error('Error fetching invoices:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/export-pdf', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const store = await readStore();
    const invoices = store.invoices
      .filter((invoice) => req.user.role === 'admin' || invoice.user_id === req.user.id)
      .filter((invoice) => !startDate || invoice.invoice_date >= startDate.toString().split('T')[0])
      .filter((invoice) => !endDate || invoice.invoice_date <= endDate.toString().split('T')[0])
      .map((invoice) => ({
        ...invoice,
        user_name: store.users.find((user) => user.id === invoice.user_id)?.username || 'Unknown',
      }));

    const html = [`<html><head><title>Invoice Report</title></head><body><h1>Invoice Report</h1>`];
    if (startDate || endDate) {
      html.push(`<p>Date range: ${startDate || 'any'} - ${endDate || 'any'}</p>`);
    }
    html.push('<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">');
    html.push('<tr><th>ID</th><th>Title</th><th>Vendor</th><th>Amount</th><th>Date</th><th>User</th></tr>');
    invoices.forEach((inv) => {
      html.push(
        `<tr><td>${inv.id}</td><td>${inv.title}</td><td>${inv.vendor}</td><td>${inv.amount}</td><td>${inv.invoice_date}</td><td>${inv.user_name}</td></tr>`,
      );
    });
    html.push('</table></body></html>');
    res.header('Content-Type', 'text/html');
    res.send(html.join(''));
  } catch (error) {
    console.error('Error exporting PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices', auth, multer({ storage: multer.diskStorage({
  destination: uploadFolder,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
}) }).single('image'), async (req, res) => {
  try {
    const { title, vendor, amount, category, description, date } = req.body;
    const numericAmount = Number(amount);
    if (!title?.trim() || !vendor?.trim() || !category?.trim() || !date || !Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: 'Title, vendor, amount, category and date are required.' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const invoice = await updateStore((store) => {
      const newInvoice = {
        id: store.nextInvoiceId++,
        user_id: req.user.id,
        title,
        vendor,
        amount: numericAmount,
        category,
        description: description || null,
        invoice_date: date,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      };
      store.invoices.push(newInvoice);
      return newInvoice;
    });
    res.json({ message: 'Invoice uploaded', id: invoice.id });
  } catch (error) {
    console.error('Error uploading invoice:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/invoices/:id', auth, async (req, res) => {
  try {
    const deleted = await updateStore((store) => {
      const invoiceId = Number(req.params.id);
      const index = store.invoices.findIndex((invoice) => invoice.id === invoiceId
        && (req.user.role === 'admin' || invoice.user_id === req.user.id));
      if (index === -1) return false;
      store.invoices.splice(index, 1);
      return true;
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Invoice not found or not owned by you' });
    }
    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('Error deleting invoice:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const hashedPassword = await bcryptHash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const user = await updateStore((store) => {
      if (store.users.some((candidate) => candidate.username === username)) {
        const duplicateError = new Error('Username already exists');
        duplicateError.code = 'DUPLICATE_USERNAME';
        throw duplicateError;
      }
      const newUser = { id: store.nextUserId++, username, password: hashedPassword, role: userRole };
      store.users.push(newUser);
      return newUser;
    });
    res.status(201).json({ id: user.id, username, role: userRole });
  } catch (error) {
    if (error.code === 'DUPLICATE_USERNAME') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Error creating user:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const store = await readStore();
    const results = store.users
      .map(({ id, username, role }) => ({ id, username, role }))
      .sort((first, second) => first.id - second.id);
    res.json({ users: results });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/daily', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? startDate.toString().split('T')[0] : new Date().toISOString().split('T')[0];
    const end = endDate ? endDate.toString().split('T')[0] : start;

    const store = await readStore();
    const results = store.users.map((user) => {
      const invoices = store.invoices.filter((invoice) => invoice.user_id === user.id
        && invoice.invoice_date >= start && invoice.invoice_date <= end);
      return {
        userId: user.id,
        username: user.username,
        invoiceCount: invoices.length,
        totalAmount: invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      };
    }).sort((first, second) => second.invoiceCount - first.invoiceCount || second.totalAmount - first.totalAmount);
    res.json({ report: results, startDate: start, endDate: end });
  } catch (error) {
    console.error('Error fetching report:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🚀 Server Starting                    ║');
  console.log(`║  Host: ${HOST.padEnd(33)}║`);
  console.log(`║  Port: ${PORT.toString().padEnd(33)}║`);
  console.log(`║  URL: http://${HOST}:${PORT}`.padEnd(41) + '║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});

