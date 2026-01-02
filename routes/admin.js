/**
 * Admin Routes
 * Handles admin dashboard, file upload, blockchain viewing
 */

import express from 'express';
import crypto from 'crypto';
import { getAllPatients, getUserByUsername, updatePatient, getAllBlocks, getPatientBlocks as getPatientBlocksDB, addBlock, getBlockchainStats, getAllDoctors, assignDoctorToPatient, removeDoctorPatientRelation, getAllDoctorPatientRelations } from '../utils/dbHelper.js';
import { uploadMetadataToIPFS, fetchFromIPFS, checkIPFSConnection } from '../utils/ipfsHelper.js';
import { addBlockToChain, getBlockchain } from '../utils/blockchainHelper.js';

const router = express.Router();

// ===========================================
// MIDDLEWARE - Check if user is admin
// ===========================================

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this page',
            statusCode: 403
        });
    }
    next();
}

// Apply middleware to all admin routes
router.use(requireAdmin);

// ===========================================
// ADMIN DASHBOARD
// ===========================================

router.get('/dashboard', async (req, res) => {
    try {
        const patients = await getAllPatients();
        const doctors = await getAllDoctors();
        const stats = await getBlockchainStats();
        const ipfsConnected = await checkIPFSConnection();
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            patients: patients,
            doctors: doctors,
            stats: stats,
            ipfsConnected: ipfsConnected
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            patients: [],
            doctors: [],
            stats: {},
            ipfsConnected: false
        });
    }
});

// ===========================================
// UPLOAD FILE PAGE
// ===========================================

router.get('/upload', async (req, res) => {
    try {
        const patients = await getAllPatients();
        const doctors = await getAllDoctors();
        res.render('admin/upload', {
            title: 'Upload Medical Record',
            user: req.session.user,
            patients: patients,
            doctors: doctors,
            success: null,
            error: null
        });
    } catch (error) {
        console.error('Upload page error:', error);
        res.status(500).send('Error loading upload page');
    }
});

// ===========================================
// UPLOAD FILE POST
// ===========================================

router.post('/upload', async (req, res) => {
    try {
        const patients = await getAllPatients();
        const doctors = await getAllDoctors();
        const {
            patient_id,
            patient_name,
            file_type,
            disease,
            description,
            file_status,
            doc_id,
            uploaded_by,
            file_base64,
            filename,
            // New GA fields
            symptoms,
            primary_diagnosis,
            secondary_diagnosis,
            affected_body_parts,
            treatments,
            medications,
            followup_required,
            followup_date,
            followup_notes
        } = req.body;
        
        // Validate required fields
        if (!patient_id || !file_type || !uploaded_by || !disease || !doc_id) {
            return res.render('admin/upload', {
                title: 'Upload Medical Record',
                user: req.session.user,
                patients: patients,
                doctors: doctors,
                success: null,
                error: 'Please fill all required fields'
            });
        }
        
        // Process array fields - filter out empty values
        const symptomsArray = Array.isArray(symptoms) 
            ? symptoms.filter(s => s && s.trim() !== '') 
            : (symptoms ? [symptoms] : []);
            
        const secondaryDiagnosisArray = Array.isArray(secondary_diagnosis)
            ? secondary_diagnosis.filter(d => d && d.trim() !== '')
            : (secondary_diagnosis ? [secondary_diagnosis] : []);
            
        const treatmentsArray = Array.isArray(treatments)
            ? treatments.filter(t => t && t.trim() !== '')
            : (treatments ? [treatments] : []);
            
        const medicationsArray = Array.isArray(medications)
            ? medications.filter(m => m && m.trim() !== '')
            : (medications ? [medications] : []);
        
        // Parse body parts (comma-separated string)
        const bodyPartsArray = affected_body_parts 
            ? affected_body_parts.split(',').map(p => p.trim()).filter(p => p !== '')
            : [];
        
        // Get doctor name from doc_id
        const doctorRecord = doctors.find(d => d.doctor_id === doc_id);
        const doctorName = doctorRecord ? `Dr. ${doctorRecord.username}` : doc_id;
        
        // Prepare complete metadata for IPFS (clean and organized)
        const ipfsMetadata = {
            // File information
            filename: filename || 'N/A',
            file_base64: file_base64 || null,
            file_type: file_type,
            
            // Patient information
            patient_id: patient_id,
            patient_name: patient_name,
            
            // Medical information
            primary_diagnosis: primary_diagnosis || disease, // Use primary_diagnosis if provided, else disease
            secondary_diagnoses: secondaryDiagnosisArray,
            symptoms: symptomsArray,
            affected_body_parts: bodyPartsArray,
            
            // Treatment information
            treatments_given: treatmentsArray,
            medications: medicationsArray,
            
            // Status and doctor
            file_status: file_status || 'Open',
            doctor: doctorName,
            uploaded_by: uploaded_by,
            
            // Follow-up information
            followup_info: {
                required: followup_required === 'yes',
                date: followup_date || null,
                notes: followup_notes || null
            },
            
            // Additional notes
            description: description || 'No additional notes',
            
            // Timestamp
            timestamp: new Date().toLocaleString()
        };
        
        // Upload complete metadata + file to IPFS
        console.log('📤 Uploading to IPFS...');
        const cid = await uploadMetadataToIPFS(ipfsMetadata);
        console.log('✅ IPFS CID:', cid);
        
        // Get last block to chain properly
        const allBlocks = await getAllBlocks();
        const lastBlock = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
        const previousHash = lastBlock ? lastBlock.block_hash : '0';
        
        // Create block hash (simple hash for now - in production use proper hashing)
        const blockData = `${allBlocks.length}${previousHash}${Date.now()}${cid}`;
        const blockHash = crypto.createHash('sha256').update(blockData).digest('hex');
        
        // Store minimal data in database blockchain_metadata table
        const blockchainData = {
            block_hash: blockHash,
            previous_hash: previousHash,
            timestamp: Date.now(),
            nonce: 0, // Simplified - no POW for now
            ipfs_cid: cid,
            patient_id: patient_id,
            file_type: file_type,
            file_status: file_status || 'Open',
            doc: doc_id
        };
        
        // Add to database
        console.log('💾 Adding to database...');
        const blockResult = await addBlock(blockchainData);
        console.log('✅ Block added to DB:', blockResult.block_index);
        
        res.render('admin/upload', {
            title: 'Upload Medical Record',
            user: req.session.user,
            patients: patients,
            doctors: doctors,
            success: `File uploaded successfully! CID: ${cid} | Block: ${blockResult.block_index}`,
            error: null
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.render('admin/upload', {
            title: 'Upload Medical Record',
            user: req.session.user,
            patients: await getAllPatients(),
            doctors: await getAllDoctors(),
            success: null,
            error: 'Upload failed: ' + error.message
        });
    }
});

// ===========================================
// VIEW BLOCKCHAIN
// ===========================================

router.get('/blockchain', async (req, res) => {
    try {
        const chain = await getAllBlocks();
        // Get last 10 blocks
        const recentBlocks = chain.slice(-10).reverse();
        
        res.render('admin/blockchain', {
            title: 'View Blockchain',
            user: req.session.user,
            blocks: recentBlocks,
            totalBlocks: chain.length
        });
    } catch (error) {
        console.error('Blockchain view error:', error);
        res.render('admin/blockchain', {
            title: 'View Blockchain',
            user: req.session.user,
            blocks: [],
            totalBlocks: 0
        });
    }
});

// ===========================================
// VIEW PATIENT RECORDS
// ===========================================

router.get('/patient-records/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const blocks = await getPatientBlocksDB(patientId);
        
        res.render('admin/patient-records', {
            title: `Records for Patient ${patientId}`,
            user: req.session.user,
            patientId: patientId,
            blocks: blocks
        });
    } catch (error) {
        console.error('Patient records error:', error);
        res.status(500).send('Error fetching patient records');
    }
});

// ===========================================
// FETCH FROM IPFS (AJAX)
// ===========================================

router.get('/api/fetch-ipfs/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const metadata = await fetchFromIPFS(cid);
        res.json({ success: true, data: metadata });
    } catch (error) {
        console.error('IPFS fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// GET FULL BLOCKCHAIN (AJAX)
// ===========================================

router.get('/api/blockchain', async (req, res) => {
    try {
        const chain = await getAllBlocks();
        res.json({ success: true, chain: chain });
    } catch (error) {
        console.error('Blockchain fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// GET PATIENT RECORDS (AJAX)
// ===========================================

router.get('/api/patient-records/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const blocks = await getPatientBlocksDB(patientId);
        res.json({ success: true, blocks: blocks });
    } catch (error) {
        console.error('Patient records fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// CHECK IPFS STATUS (AJAX)
// ===========================================

router.get('/api/ipfs-status', async (req, res) => {
    try {
        const isConnected = await checkIPFSConnection();
        res.json({ success: true, connected: isConnected });
    } catch (error) {
        res.json({ success: false, connected: false });
    }
});

// ===========================================
// GET PATIENT DATA (AJAX)
// ===========================================

router.get('/api/patient-data/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const patients = await getAllPatients();
        const patient = patients.find(p => p.patient_id === patientId);
        
        if (patient) {
            res.json({ success: true, patient: patient });
        } else {
            res.json({ success: false, error: 'Patient not found' });
        }
    } catch (error) {
        console.error('Patient data fetch error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// UPDATE PATIENT DATA (AJAX)
// ===========================================

router.post('/api/update-patient', async (req, res) => {
    try {
        const { patient_id, full_name, ...updateData } = req.body;
        
        if (!patient_id) {
            console.error('No patient_id provided');
            return res.json({ success: false, error: 'Patient ID is required' });
        }
        
        console.log('Admin updating patient:', patient_id);
        console.log('Update data:', updateData);
        
        // Remove empty strings and convert height/weight to numbers
        const cleanedData = {};
        for (const [key, value] of Object.entries(updateData)) {
            if (value !== '' && value !== null && value !== undefined) {
                if (key === 'height' || key === 'weight') {
                    cleanedData[key] = parseFloat(value);
                } else {
                    cleanedData[key] = value;
                }
            }
        }
        
        console.log('Cleaned data:', cleanedData);
        
        // Update the patient data in database using patient_id
        const result = await updatePatient(patient_id, cleanedData);
        
        console.log('Update result:', result);
        
        res.json({ success: true, message: 'Patient data updated successfully' });
    } catch (error) {
        console.error('Patient update error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===========================================
// DOCTOR-PATIENT MANAGEMENT
// ===========================================

// Get all doctor-patient relations
router.get('/api/doctor-patient-relations', async (req, res) => {
    try {
        const relations = await getAllDoctorPatientRelations();
        res.json({ success: true, relations });
    } catch (error) {
        console.error('Get relations error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Get all doctors
router.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await getAllDoctors();
        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Assign doctor to patient
router.post('/api/assign-doctor', async (req, res) => {
    try {
        const { doctor_id, patient_id } = req.body;
        
        if (!doctor_id || !patient_id) {
            return res.json({ success: false, error: 'Doctor ID and Patient ID are required' });
        }
        
        await assignDoctorToPatient(doctor_id, patient_id);
        res.json({ success: true, message: 'Doctor assigned successfully' });
    } catch (error) {
        console.error('Assign doctor error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Remove doctor-patient relation
router.delete('/api/remove-doctor-patient/:doctorId/:patientId', async (req, res) => {
    try {
        const { doctorId, patientId } = req.params;
        await removeDoctorPatientRelation(doctorId, patientId);
        res.json({ success: true, message: 'Relation removed successfully' });
    } catch (error) {
        console.error('Remove relation error:', error);
        res.json({ success: false, error: error.message });
    }
});

export default router;
