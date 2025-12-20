/**
 * Patient Routes
 * Handles patient dashboard and viewing own records
 */

import express from 'express';
import { getUserByUsername, updatePatient, getPatientBlocks } from '../utils/dbHelper.js';
import { fetchFromIPFS } from '../utils/ipfsHelper.js';

const router = express.Router();

// ===========================================
// MIDDLEWARE - Check if user is logged in
// ===========================================

function requirePatient(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Apply middleware to all patient routes
router.use(requirePatient);

// ===========================================
// PATIENT DASHBOARD
// ===========================================

router.get('/dashboard', async (req, res) => {
    try {
        const username = req.session.user.username;
        const user = await getUserByUsername(username);
        const patientId = user.patient_id || username;
        
        // Get patient's records from blockchain
        const blocks = await getPatientBlocks(patientId);
        
        // Sort by timestamp (newest first)
        blocks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.render('patient/dashboard', {
            title: 'Patient Dashboard',
            user: req.session.user,
            userData: user,
            blocks: blocks,
            patientId: patientId
        });
    } catch (error) {
        console.error('Patient dashboard error:', error);
        res.render('patient/dashboard', {
            title: 'Patient Dashboard',
            user: req.session.user,
            userData: {},
            blocks: [],
            patientId: req.session.user.patient_id
        });
    }
});

// ===========================================
// PATIENT PROFILE
// ===========================================

router.get('/profile', async (req, res) => {
    try {
        const username = req.session.user.username;
        const user = await getUserByUsername(username);
        
        res.render('patient/profile', {
            title: 'My Profile',
            user: req.session.user,
            userData: user,
            success: null,
            error: null
        });
    } catch (error) {
        console.error('Profile page error:', error);
        res.status(500).send('Error loading profile');
    }
});

// ===========================================
// UPDATE PROFILE
// ===========================================

router.post('/profile', async (req, res) => {
    try {
        const username = req.session.user.username;
        const {
            full_name,
            gender,
            date_of_birth,
            blood_group,
            phone,
            email,
            address,
            emergency_contact_name,
            emergency_contact_phone
        } = req.body;
        
        // Update patient data in database
        await updatePatient(username, {
            gender,
            date_of_birth,
            blood_group,
            contact: phone,
            email,
            height: null, // Keep existing if not provided
            weight: null,
            current_conditions: null
        });
        
        // Reload updated user data
        const user = await getUserByUsername(username);
        
        res.render('patient/profile', {
            title: 'My Profile',
            user: req.session.user,
            userData: user,
            success: 'Profile updated successfully!',
            error: null
        });
        
    } catch (error) {
        console.error('Profile update error:', error);
        const user = await getUserByUsername(req.session.user.username);
        res.render('patient/profile', {
            title: 'My Profile',
            user: req.session.user,
            userData: user,
            success: null,
            error: 'Failed to update profile'
        });
    }
});

// ===========================================
// VIEW RECORD DETAILS (AJAX)
// ===========================================

router.get('/api/record/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const metadata = await fetchFromIPFS(cid);
        res.json({ success: true, data: metadata });
    } catch (error) {
        console.error('Record fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// UPDATE PROFILE (AJAX from Dashboard)
// ===========================================

router.post('/api/update-profile', async (req, res) => {
    try {
        const username = req.session.user.username;
        const {
            full_name,
            gender,
            date_of_birth,
            blood_group,
            phone,
            address
        } = req.body;
        
        // Update patient data in database
        const updateData = {};
        if (req.body.gender) updateData.gender = req.body.gender;
        if (req.body.date_of_birth) updateData.date_of_birth = req.body.date_of_birth;
        if (req.body.blood_group) updateData.blood_group = req.body.blood_group;
        if (req.body.contact) updateData.contact = req.body.contact;
        if (req.body.email) updateData.email = req.body.email;
        if (req.body.height) updateData.height = req.body.height;
        if (req.body.weight) updateData.weight = req.body.weight;
        if (req.body.current_conditions !== undefined) updateData.current_conditions = req.body.current_conditions;
        
        await updatePatient(username, updateData);
        
        res.json({ success: true, message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.json({ success: false, error: error.message });
    }
});

export default router;
