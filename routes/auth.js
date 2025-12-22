/**
 * Authentication Routes
 * Handles login, register, and logout
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { getUserByUsername, createPatient, generateUniquePatientId, getDoctorByUsername, createDoctor, generateUniqueDoctorId } from '../utils/dbHelper.js';

const router = express.Router();

// ===========================================
// HOME / LOGIN PAGE
// ===========================================

router.get('/', (req, res) => {
    // If already logged in, redirect to appropriate dashboard
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        } else if (req.session.user.role === 'doctor') {
            return res.redirect('/doctor/dashboard');
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
        } else if (req.session.user.role === 'doctor') {
            return res.redirect('/doctor/dashboard');
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
        const { username, password, role } = req.body;
        
        // Validate input
        if (!username || !password || !role) {
            return res.render('login', {
                title: 'Login',
                error: 'Please provide username, password, and role'
            });
        }
        
        let user;
        let userRole;
        
        // Admin login (hardcoded for now)
        if (role === 'admin') {
            if (username === 'admin' && password === 'admin') {
                req.session.user = {
                    username: 'admin',
                    role: 'admin'
                };
                return res.redirect('/admin/dashboard');
            } else {
                return res.render('login', {
                    title: 'Login',
                    error: 'Invalid admin credentials'
                });
            }
        }
        
        // Get user from appropriate table based on role
        if (role === 'patient') {
            // Prevent admin username from logging in as patient
            if (username === 'admin') {
                return res.render('login', {
                    title: 'Login',
                    error: 'Invalid username or password'
                });
            }
            user = await getUserByUsername(username);
            userRole = 'patient';
        } else if (role === 'doctor') {
            // Prevent admin username from logging in as doctor
            if (username === 'admin') {
                return res.render('login', {
                    title: 'Login',
                    error: 'Invalid username or password'
                });
            }
            user = await getDoctorByUsername(username);
            userRole = 'doctor';
        } else {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid role selected'
            });
        }
        
        if (!user) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }
        
        // Check password
        if (user.password !== password) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }
        
        // Create session
        req.session.user = {
            username: username,
            role: userRole,
            patient_id: user.patient_id,
            doctor_id: user.doctor_id,
            full_name: user.full_name
        };
        
        // Redirect based on role
        if (userRole === 'doctor') {
            res.redirect('/doctor/dashboard');
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
        const { username, password, role, gender, specialization, license_number } = req.body;
        
        // Validate input
        if (!username || !password || !role) {
            return res.render('register', {
                title: 'Register',
                error: 'Username, password, and role are required',
                success: null
            });
        }
        
        // Check if role is valid
        if (role !== 'patient' && role !== 'doctor') {
            return res.render('register', {
                title: 'Register',
                error: 'Invalid role selected',
                success: null
            });
        }
        
        // Check if username already exists in either table
        const existingPatient = await getUserByUsername(username);
        const existingDoctor = await getDoctorByUsername(username);
        
        if (existingPatient || existingDoctor) {
            return res.render('register', {
                title: 'Register',
                error: 'Username already exists',
                success: null
            });
        }
        
        if (role === 'patient') {
            // Generate unique patient_id (format: P0001, P0002, etc.)
            const patientId = await generateUniquePatientId();
            
            // Create new patient in database
            const patientData = {
                patient_id: patientId,
                username: username,
                password: password,
                gender: gender || null,
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
                success: `Registration successful! Your Patient ID is ${patientId}. Please login.`
            });
            
        } else if (role === 'doctor') {
            // Generate unique doctor_id (format: D0001, D0002, etc.)
            const doctorId = await generateUniqueDoctorId();
            
            // Create new doctor in database
            const doctorData = {
                doctor_id: doctorId,
                username: username,
                password: password,
                gender: gender || null,
                specialization: specialization || null,
                license_number: license_number || null,
                contact: null,
                email: null
            };
            
            await createDoctor(doctorData);
            
            res.render('register', {
                title: 'Register',
                error: null,
                success: `Registration successful! Your Doctor ID is ${doctorId}. Please login.`
            });
        }
        
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
