/**
 * Authentication Routes
 * Handles login, register, and logout
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { getUserByUsername, createPatient } from '../utils/dbHelper.js';

const router = express.Router();

// ===========================================
// HOME / LOGIN PAGE
// ===========================================

router.get('/', (req, res) => {
    // If already logged in, redirect to appropriate dashboard
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/patient/dashboard');
        }
    }
    res.render('login', { title: 'Login', error: null });
});

router.get('/login', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/patient/dashboard');
        }
    }
    res.render('login', { title: 'Login', error: null });
});

// ===========================================
// LOGIN POST
// ===========================================

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.render('login', {
                title: 'Login',
                error: 'Please provide both username and password'
            });
        }
        
        // Get user from database
        const user = await getUserByUsername(username);
        
        if (!user) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }
        
        // Check password (plain text for now, will add bcrypt later)
        // For educational purposes, we'll compare directly
        if (user.password !== password) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }
        
        // Create session
        req.session.user = {
            username: username,
            role: user.role,
            patient_id: user.patient_id,
            full_name: user.full_name
        };
        
        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/patient/dashboard');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            title: 'Login',
            error: 'An error occurred. Please try again.'
        });
    }
});

// ===========================================
// REGISTER PAGE
// ===========================================

router.get('/register', (req, res) => {
    res.render('register', { title: 'Register', error: null, success: null });
});

// ===========================================
// REGISTER POST
// ===========================================

router.post('/register', async (req, res) => {
    try {
        const { username, password, patient_id } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.render('register', {
                title: 'Register',
                error: 'Username and password are required',
                success: null
            });
        }
        
        // Check if username already exists
        const existingUser = await getUserByUsername(username);
        if (existingUser) {
            return res.render('register', {
                title: 'Register',
                error: 'Username already exists',
                success: null
            });
        }
        
        // Create new patient in database
        const patientData = {
            patient_id: patient_id || username,
            username: username,
            password: password, // Plain text for now (no hashing for testing)
            gender: null,
            date_of_birth: null,
            blood_group: null,
            contact: null,
            email: null,
            height: null,
            weight: null,
            current_conditions: null
        };
        
        await createPatient(patientData);
        
        res.render('register', {
            title: 'Register',
            error: null,
            success: 'Registration successful! Please login.'
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', {
            title: 'Register',
            error: 'An error occurred during registration',
            success: null
        });
    }
});

// ===========================================
// LOGOUT
// ===========================================

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

export default router;
