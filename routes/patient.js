/**
 * Patient Routes
 * Handles patient dashboard and viewing own records
 */

import express from 'express';
import { getUserByUsername, updatePatient, getPatientBlocks, getAllPatients, getAllDoctors, grantConsent, getGrantedConsents, withdrawConsent, getReceivedConsents, getPatientsWhoGrantedConsent, getConsentedBlocks } from '../utils/dbHelper.js';
import { fetchFromIPFS } from '../utils/ipfsHelper.js';
import { generatePatientForecast } from '../utils/forecastHelper.js';

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
        console.log('Fetching record from IPFS CID:', cid);
        const metadata = await fetchFromIPFS(cid);
        console.log('IPFS data keys:', Object.keys(metadata));
        console.log('IPFS data sample:', {
            patient_name: metadata.patient_name,
            patient_id: metadata.patient_id,
            file_type: metadata.file_type,
            doctor: metadata.doctor,
            uploaded_by: metadata.uploaded_by,
            timestamp: metadata.timestamp,
            has_file: !!metadata.file_base64
        });
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
        if (!req.session.user || !req.session.user.patient_id) {
            return res.json({ success: false, error: 'Not authenticated' });
        }
        
        const patient_id = req.session.user.patient_id;
        
        // Build update data object with only provided fields
        const updateData = {};
        if (req.body.gender) updateData.gender = req.body.gender;
        if (req.body.date_of_birth) updateData.date_of_birth = req.body.date_of_birth;
        if (req.body.blood_group) updateData.blood_group = req.body.blood_group;
        if (req.body.contact) updateData.contact = req.body.contact;
        if (req.body.email) updateData.email = req.body.email;
        if (req.body.height !== undefined && req.body.height !== '') updateData.height = parseFloat(req.body.height);
        if (req.body.weight !== undefined && req.body.weight !== '') updateData.weight = parseFloat(req.body.weight);
        if (req.body.current_conditions !== undefined) updateData.current_conditions = req.body.current_conditions;
        
        console.log('Updating patient profile:', patient_id, updateData);
        
        await updatePatient(patient_id, updateData);
        
        res.json({ success: true, message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// DEBUG SESSION ENDPOINT
// ===========================================

router.get('/api/debug-session', (req, res) => {
    console.log('Session debug:', req.session.user);
    res.json({ 
        success: true, 
        session: req.session.user,
        hasPatientId: !!req.session.user?.patient_id 
    });
});

// ===========================================
// GET ALL PATIENTS (for consent dropdown)
// ===========================================

router.get('/api/all-patients', async (req, res) => {
    console.log('All patients request - session:', req.session.user);
    try {
        const patients = await getAllPatients();
        // Exclude current user if patient_id exists
        const currentPatientId = req.session.user?.patient_id;
        const filtered = currentPatientId ? patients.filter(p => p.patient_id !== currentPatientId) : patients;
        res.json({ success: true, patients: filtered });
    } catch (error) {
        console.error('Get all patients error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET ALL DOCTORS (for consent dropdown)
// ===========================================

router.get('/api/all-doctors', async (req, res) => {
    console.log('All doctors request - session:', req.session.user);
    try {
        const doctors = await getAllDoctors();
        console.log('Found doctors:', doctors.length);
        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Get all doctors error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GRANT CONSENT
// ===========================================

router.post('/grant-consent', async (req, res) => {
    try {
        const patient_id = req.session.user.patient_id;
        const { grantee_type, grantee_id, record_id } = req.body;
        
        if (!grantee_type || !grantee_id) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        const granted_doctor = grantee_type === 'doctor' ? grantee_id : null;
        const granted_patient = grantee_type === 'patient' ? grantee_id : null;
        const record = record_id === 'all' ? null : parseInt(record_id);
        
        await grantConsent(patient_id, granted_doctor, granted_patient, record);
        
        res.json({ success: true, message: 'Consent granted successfully' });
    } catch (error) {
        console.error('Grant consent error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET GRANTED CONSENTS
// ===========================================

router.get('/api/granted-consents', async (req, res) => {
    console.log('Granted consents request - session:', req.session.user);
    try {
        const patient_id = req.session.user.patient_id;
        console.log('Patient ID:', patient_id);
        
        if (!patient_id) {
            return res.status(400).json({ success: false, error: 'Patient ID not found in session' });
        }
        
        const consents = await getGrantedConsents(patient_id);
        res.json({ success: true, consents });
    } catch (error) {
        console.error('Get granted consents error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// WITHDRAW CONSENT
// ===========================================

router.post('/withdraw-consent', async (req, res) => {
    try {
        const { consent_id } = req.body;
        
        if (!consent_id) {
            return res.status(400).json({ success: false, error: 'Consent ID required' });
        }
        
        await withdrawConsent(consent_id);
        
        res.json({ success: true, message: 'Consent withdrawn successfully' });
    } catch (error) {
        console.error('Withdraw consent error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET RECEIVED CONSENTS (from other patients)
// ===========================================

router.get('/api/received-consents', async (req, res) => {
    try {
        const patient_id = req.session.user.patient_id;
        const consents = await getReceivedConsents(patient_id, 'patient');
        res.json({ success: true, consents });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET PATIENTS WHO GRANTED CONSENT
// ===========================================

router.get('/api/patients-granted-to-me', async (req, res) => {
    try {
        const patient_id = req.session.user.patient_id;
        const patients = await getPatientsWhoGrantedConsent(patient_id, 'patient');
        res.json({ success: true, patients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET CONSENTED BLOCKS
// ===========================================

router.get('/api/consented-blocks/:patientId', async (req, res) => {
    try {
        const viewer_id = req.session.user.patient_id;
        const { patientId } = req.params;
        
        const blocks = await getConsentedBlocks(patientId, viewer_id, 'patient');
        
        res.json({ success: true, blocks });
    } catch (error) {
        console.error('Get consented blocks error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// HEALTH FORECAST API
// ===========================================

/**
 * GET /patient/api/forecast
 * Generate health forecast based on similar patient cases
 */
router.get('/api/forecast', async (req, res) => {
    try {
        const username = req.session.user.username;
        const user = await getUserByUsername(username);
        const patientId = user.patient_id || username;

        console.log(`📊 Forecast request from patient: ${patientId}`);

        // Generate forecast using GA-based similarity search
        const forecast = await generatePatientForecast(patientId);

        res.json(forecast);
    } catch (error) {
        console.error('Forecast API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating forecast: ' + error.message
        });
    }
});

export default router;
