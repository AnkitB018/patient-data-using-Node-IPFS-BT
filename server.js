/**
 * Medical Records Management System
 * Using Blockchain + IPFS for secure, decentralized patient records
 * 
 * Main Server File - Express.js Application
 */

// Import required packages
import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import patientRoutes from './routes/patient.js';

// ES6 module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;


// Logging middleware (see HTTP requests in console)
app.use(morgan('dev'));

// Body parser middleware (parse form data and JSON)
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// Session middleware (manage user login sessions)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Favicon route
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===========================================
// ROUTES
// ===========================================

// Authentication routes (login, register, logout)
app.use('/', authRoutes);

// Admin routes (upload records, view blockchain)
app.use('/admin', adminRoutes);

// Patient routes (view own records)
app.use('/patient', patientRoutes);

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.',
        statusCode: 404
    });
});

// General error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).render('error', {
        title: '500 - Server Error',
        message: 'Something went wrong on our end. Please try again later.',
        statusCode: 500,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// ===========================================
// START SERVER
// ===========================================

app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Medical Records Management System           ║');
    console.log('║   Blockchain + IPFS                            ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Server running on: http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Blockchain API: ${process.env.BLOCKCHAIN_API_URL}`);
    console.log(`📦 IPFS: ${process.env.IPFS_PROTOCOL}://${process.env.IPFS_HOST}:${process.env.IPFS_PORT}`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('════════════════════════════════════════════════');
});
