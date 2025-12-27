/**
 * Doctor Routes
 * Handles doctor dashboard and operations
 */

import express from 'express';
import crypto from 'crypto';
import { getPatientsForDoctor, getPatientBlocks, addBlock, getAllPatients, assignDoctorToPatient, removeDoctorPatientRelation, getAllDoctorPatientRelations, getPatientById, updatePatient, getReceivedConsents, getPatientsWhoGrantedConsent, getConsentedBlocks } from '../utils/dbHelper.js';
import { uploadMetadataToIPFS, fetchFromIPFS } from '../utils/ipfsHelper.js';
import { addBlockToChain } from '../utils/blockchainHelper.js';

const router = express.Router();

// ===========================================
// MIDDLEWARE - Check if user is doctor
// ===========================================

function requireDoctor(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'doctor') {
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this page',
            statusCode: 403
        });
    }
    next();
}

// Apply middleware to all doctor routes
router.use(requireDoctor);

// ===========================================
// DOCTOR DASHBOARD
// ===========================================

router.get('/dashboard', async (req, res) => {
    try {
        // Get doctor's ID from session
        const doctorId = req.session.user.doctor_id;
        
        // Fetch patients assigned to this doctor
        const patients = await getPatientsForDoctor(doctorId);
        
        res.render('doctor/dashboard', {
            title: 'Doctor Dashboard',
            user: req.session.user,
            patients: patients,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Doctor dashboard error:', error);
        res.render('doctor/dashboard', {
            title: 'Doctor Dashboard',
            user: req.session.user,
            patients: [],
            success: null,
            error: null
        });
    }
});

// ===========================================
// GET DOCTOR'S PATIENTS (API)
// ===========================================

router.get('/api/my-patients', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const patients = await getPatientsForDoctor(doctorId);
        res.json({ success: true, patients });
    } catch (error) {
        console.error('Get patients error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// GET PATIENT RECORDS (API)
// ===========================================

router.get('/api/patient-records/:patientId', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const { patientId } = req.params;
        
        // Verify this patient is assigned to this doctor
        const myPatients = await getPatientsForDoctor(doctorId);
        const hasAccess = myPatients.some(p => p.patient_id === patientId);
        
        if (!hasAccess) {
            return res.json({ success: false, error: 'Access denied to this patient' });
        }
        
        const blocks = await getPatientBlocks(patientId);
        res.json({ success: true, blocks });
    } catch (error) {
        console.error('Get patient records error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// FETCH IPFS DATA (API)
// ===========================================

router.get('/api/fetch-ipfs/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const data = await fetchFromIPFS(cid);
        res.json({ success: true, data });
    } catch (error) {
        console.error('IPFS fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// UPLOAD MEDICAL RECORD
// ===========================================

router.post('/upload', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const {
            patient_id,
            file_base64,
            filename,
            file_type,
            disease,
            doctor,
            description,
            file_status,
            next_appointment,
            symptoms,
            secondary_diagnosis,
            affected_body_parts,
            treatments,
            medications,
            followup_required,
            followup_date,
            followup_notes
        } = req.body;

        // Verify this patient is assigned to this doctor
        const myPatients = await getPatientsForDoctor(doctorId);
        const hasAccess = myPatients.some(p => p.patient_id === patient_id);
        
        if (!hasAccess) {
            return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Access denied to this patient'));
        }

        // Process array fields
        const symptomsArray = Array.isArray(symptoms) ? symptoms.filter(s => s && s.trim()) : [];
        const secondaryDiagArray = Array.isArray(secondary_diagnosis) ? secondary_diagnosis.filter(d => d && d.trim()) : [];
        const treatmentsArray = Array.isArray(treatments) ? treatments.filter(t => t && t.trim()) : [];
        const medicationsArray = Array.isArray(medications) ? medications.filter(m => m && m.trim()) : [];
        const affectedPartsArray = affected_body_parts ? affected_body_parts.split(',').map(p => p.trim()).filter(p => p) : [];

        // Create metadata object
        const metadata = {
            'Patient ID': patient_id,
            'Patient Name': myPatients.find(p => p.patient_id === patient_id)?.username || 'Unknown',
            'File Type': file_type,
            'Disease': disease,
            'doctor': doctor,
            'Uploaded By': `Dr. ${req.session.user.username}`,
            'Timestamp': new Date().toISOString(),
            'Description': description || '',
            'File Status': file_status || 'Open',
            'Next Appointment': next_appointment || '',
            'file_data': file_base64,
            'filename': filename,
            'symptoms': symptomsArray,
            'primary_diagnosis': disease,
            'secondary_diagnoses': secondaryDiagArray,
            'affected_body_parts': affectedPartsArray,
            'treatments': treatmentsArray,
            'medications': medicationsArray,
            'followup_info': {
                required: followup_required || 'No',
                date: followup_date || '',
                notes: followup_notes || ''
            }
        };

        // Upload to IPFS
        const cid = await uploadMetadataToIPFS(metadata);
        console.log('✅ Uploaded to IPFS with CID:', cid);

        // Add to blockchain via Flask API
        const blockchainData = {
            patient_id: patient_id,
            file_type: file_type,
            file_status: file_status || 'Open',
            cid: cid,
            doc: doctorId,
            data: metadata
        };

        const blockchainResult = await addBlockToChain(blockchainData);
        console.log('✅ Added to blockchain:', blockchainResult);

        res.redirect('/doctor/dashboard?success=' + encodeURIComponent('Record uploaded successfully!'));

    } catch (error) {
        console.error('Upload error:', error);
        res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Upload failed: ' + error.message));
    }
});

// ===========================================
// GET PATIENT INFO BY ID
// ===========================================

router.get('/api/patient-info/:patientId', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const { patientId } = req.params;
        
        // Verify this patient is assigned to this doctor
        const myPatients = await getPatientsForDoctor(doctorId);
        const hasAccess = myPatients.some(p => p.patient_id === patientId);
        
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'Access denied to this patient' });
        }
        
        const patient = await getPatientById(patientId);
        
        if (!patient) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }
        
        res.json({ success: true, patient });
    } catch (error) {
        console.error('Error fetching patient info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// UPDATE PATIENT MEDICAL INFORMATION
// ===========================================

router.post('/update-patient-info', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const { patient_id, blood_group, date_of_birth, height, weight, current_conditions } = req.body;
        
        // Verify this patient is assigned to this doctor
        const myPatients = await getPatientsForDoctor(doctorId);
        const hasAccess = myPatients.some(p => p.patient_id === patient_id);
        
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'Access denied to this patient' });
        }
        
        // Update only medical fields, not personal details
        const updateData = {
            blood_group,
            date_of_birth,
            height,
            weight,
            current_conditions
        };
        
        await updatePatient(patient_id, updateData);
        
        res.json({ success: true, message: 'Medical information updated successfully' });
    } catch (error) {
        console.error('Error updating patient info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET ALL PATIENTS (for allocation dropdown)
// ===========================================

router.get('/api/all-patients', async (req, res) => {
    try {
        const patients = await getAllPatients();
        res.json({ success: true, patients });
    } catch (error) {
        console.error('Error fetching all patients:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET DOCTOR'S CURRENT ALLOCATIONS
// ===========================================

router.get('/api/my-allocations', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const allRelations = await getAllDoctorPatientRelations();
        
        // Filter to only this doctor's relations
        const myRelations = allRelations.filter(rel => rel.doc_id === doctorId);
        
        res.json({ success: true, relations: myRelations });
    } catch (error) {
        console.error('Error fetching allocations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// ALLOCATE PATIENT TO SELF
// ===========================================

router.post('/allocate-patient', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const { patient_id } = req.body;
        
        if (!patient_id) {
            return res.status(400).json({ success: false, error: 'Patient ID is required' });
        }
        
        await assignDoctorToPatient(doctorId, patient_id);
        
        res.json({ success: true, message: 'Patient allocated successfully' });
    } catch (error) {
        console.error('Error allocating patient:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// REMOVE PATIENT ALLOCATION
// ===========================================

router.post('/remove-patient', async (req, res) => {
    try {
        const doctorId = req.session.user.doctor_id;
        const { patient_id } = req.body;
        
        if (!patient_id) {
            return res.status(400).json({ success: false, error: 'Patient ID is required' });
        }
        
        await removeDoctorPatientRelation(doctorId, patient_id);
        
        res.json({ success: true, message: 'Patient removed successfully' });
    } catch (error) {
        console.error('Error removing patient:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET RECEIVED CONSENTS (from patients)
// ===========================================

router.get('/api/received-consents', async (req, res) => {
    try {
        const doctor_id = req.session.user.doctor_id;
        const consents = await getReceivedConsents(doctor_id, 'doctor');
        res.json({ success: true, consents });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET PATIENTS WHO GRANTED CONSENT TO DOCTOR
// ===========================================

router.get('/api/patients-granted-to-me', async (req, res) => {
    try {
        const doctor_id = req.session.user.doctor_id;
        const patients = await getPatientsWhoGrantedConsent(doctor_id, 'doctor');
        res.json({ success: true, patients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===========================================
// GET CONSENTED BLOCKS FOR DOCTOR
// ===========================================

router.get('/api/consented-blocks/:patientId', async (req, res) => {
    try {
        const doctor_id = req.session.user.doctor_id;
        const { patientId } = req.params;
        
        const blocks = await getConsentedBlocks(patientId, doctor_id, 'doctor');
        
        res.json({ success: true, blocks });
    } catch (error) {
        console.error('Get consented blocks error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
