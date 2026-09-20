require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('./storage');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET;
const STORAGE_BUCKET = 'invoice-images';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the backend environment.');
}

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((origin) => origin.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const bcryptHash = (password, saltRounds = 10) => new Promise((resolve, reject) => {
  bcrypt.hash(password, saltRounds, (err, hash) => err ? reject(err) : resolve(hash));
});

const bcryptCompare = (plain, hash) => new Promise((resolve, reject) => {
  bcrypt.compare(plain, hash, (err, result) => err ? reject(err) : resolve(result));
});

function throwIfSupabaseError(error, message) {
  if (error) {
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.code = error.code;
    throw wrapped;
  }
}

function dateOnly(value) {
  return value?.toString().split('T')[0];
}

function safeStorageName(name) {
  return (name || 'invoice.jpg').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function signedImageUrl(imagePath) {
  if (!imagePath) return null;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(imagePath, 3600);
  throwIfSupabaseError(error, 'Unable to create invoice image URL');
  return data.signedUrl;
}

async function withSignedImageUrl(invoice) {
  return { ...invoice, image_url: await signedImageUrl(invoice.image_url) };
}

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, password, role')
    .order('id');
  throwIfSupabaseError(error, 'Unable to load users');
  return data || [];
}

async function getInvoicesForRequest(req) {
  const { search, startDate, endDate, userId } = req.query;
  let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

  if (req.user.role !== 'admin') query = query.eq('user_id', req.user.id);
  if (req.user.role === 'admin' && userId) query = query.eq('user_id', Number(userId));
  if (startDate) query = query.gte('invoice_date', dateOnly(startDate));
  if (endDate) query = query.lte('invoice_date', dateOnly(endDate));

  const { data, error } = await query;
  throwIfSupabaseError(error, 'Unable to load invoices');

  const users = await getUsers();
  const usernameById = new Map(users.map((user) => [user.id, user.username]));
  const normalizedSearch = search?.toString().toLowerCase();
  const filtered = (data || []).filter((invoice) => !normalizedSearch || [
    invoice.title,
    invoice.vendor,
    invoice.category,
  ].some((value) => `${value || ''}`.toLowerCase().includes(normalizedSearch)));

  const invoices = await Promise.all(filtered.map(async (invoice) => ({
    ...(await withSignedImageUrl(invoice)),
    user_name: usernameById.get(invoice.user_id) || 'Unknown',
  })));
  const totalAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  return { invoices, totalAmount };
}

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.post('/login', async (req, res) => {
  try {
    const username = req.body.username?.toString().trim() ?? '';
    const password = req.body.password?.toString() ?? '';
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        error: 'Missing credentials',
      });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, role')
      .eq('username', username)
      .maybeSingle();
    throwIfSupabaseError(error, 'Unable to query user');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials', error: 'User not found' });
    }

    const storedPassword = user.password?.toString() ?? '';
    const looksHashed = /^\$2[aby]\$/.test(storedPassword);
    const passwordMatches = looksHashed
      ? await bcryptCompare(password, storedPassword)
      : password === storedPassword;

    if (passwordMatches && !looksHashed) {
      const newHash = await bcryptHash(password, 10);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newHash })
        .eq('id', user.id);
      throwIfSupabaseError(updateError, 'Unable to secure user password');
    }

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid credentials', error: 'Password mismatch' });
    }

    const role = user.role || 'user';
    const token = jwt.sign({ id: user.id, username: user.username, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, role },
    });
  } catch (error) {
    console.error('Login endpoint error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

app.get('/api/invoices', auth, async (req, res) => {
  try {
    res.json(await getInvoicesForRequest(req));
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/export-pdf', auth, async (req, res) => {
  try {
    const { invoices } = await getInvoicesForRequest(req);
    const { startDate, endDate } = req.query;
    const html = ['<html><head><title>Invoice Report</title></head><body><h1>Invoice Report</h1>'];
    if (startDate || endDate) html.push(`<p>Date range: ${startDate || 'any'} - ${endDate || 'any'}</p>`);
    html.push('<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">');
    html.push('<tr><th>ID</th><th>Title</th><th>Vendor</th><th>Amount</th><th>Date</th><th>User</th></tr>');
    invoices.forEach((invoice) => html.push(
      `<tr><td>${invoice.id}</td><td>${invoice.title}</td><td>${invoice.vendor}</td><td>${invoice.amount}</td><td>${invoice.invoice_date}</td><td>${invoice.user_name}</td></tr>`,
    ));
    html.push('</table></body></html>');
    res.type('html').send(html.join(''));
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices', auth, upload.single('image'), async (req, res) => {
  let uploadedPath;
  try {
    const { title, vendor, amount, category, description, date } = req.body;
    const numericAmount = Number(amount);
    if (!title?.trim() || !vendor?.trim() || !category?.trim() || !date
      || !Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: 'Title, vendor, amount, category and date are required.' });
    }

    if (req.file) {
      uploadedPath = `${req.user.id}/${Date.now()}-${safeStorageName(req.file.originalname)}`;
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(uploadedPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
      throwIfSupabaseError(error, 'Unable to upload invoice image');
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        user_id: req.user.id,
        title: title.trim(),
        vendor: vendor.trim(),
        amount: numericAmount,
        category: category.trim(),
        description: description || null,
        invoice_date: date,
        image_url: uploadedPath || null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    throwIfSupabaseError(error, 'Unable to save invoice');
    res.json({ message: 'Invoice uploaded', id: invoice.id });
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([uploadedPath]);
      if (cleanupError) console.error('Invoice image cleanup failed:', cleanupError);
    }
    console.error('Error uploading invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/invoices/:id', auth, async (req, res) => {
  try {
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, user_id, image_url')
      .eq('id', Number(req.params.id))
      .maybeSingle();
    throwIfSupabaseError(fetchError, 'Unable to find invoice');
    if (!invoice || (req.user.role !== 'admin' && invoice.user_id !== req.user.id)) {
      return res.status(404).json({ error: 'Invoice not found or not owned by you' });
    }

    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoice.id);
    throwIfSupabaseError(deleteError, 'Unable to delete invoice');
    if (invoice.image_url) {
      const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([invoice.image_url]);
      throwIfSupabaseError(storageError, 'Invoice deleted but image cleanup failed');
    }
    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const normalizedUsername = username?.toString().trim();
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const hashedPassword = await bcryptHash(password, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ username: normalizedUsername, password: hashedPassword, role: role === 'admin' ? 'admin' : 'user' })
      .select('id, username, role')
      .single();
    if (error?.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    throwIfSupabaseError(error, 'Unable to create user');
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await getUsers();
    res.json({ users: users.map(({ id, username, role }) => ({ id, username, role })) });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/daily', auth, adminOnly, async (req, res) => {
  try {
    const start = dateOnly(req.query.startDate) || new Date().toISOString().split('T')[0];
    const end = dateOnly(req.query.endDate) || start;
    const [users, invoiceResponse] = await Promise.all([
      getUsers(),
      supabase.from('invoices').select('user_id, amount, invoice_date'),
    ]);
    throwIfSupabaseError(invoiceResponse.error, 'Unable to load report invoices');
    const invoices = invoiceResponse.data || [];
    const results = users.map((user) => {
      const userInvoices = invoices.filter((invoice) => invoice.user_id === user.id
        && invoice.invoice_date >= start && invoice.invoice_date <= end);
      return {
        userId: user.id,
        username: user.username,
        invoiceCount: userInvoices.length,
        totalAmount: userInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      };
    }).sort((first, second) => second.invoiceCount - first.invoiceCount || second.totalAmount - first.totalAmount);
    res.json({ report: results, startDate: start, endDate: end });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) return res.status(503).json({ status: 'ERROR', database: 'supabase', error: error.message });
  res.json({ status: 'OK', database: 'supabase' });
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found', path: req.path }));

app.listen(PORT, HOST, () => {
  console.log(`Invoice backend listening on http://${HOST}:${PORT}`);
});
