/**
 * Genetic Algorithm Routes
 * API endpoints for medical record recommendation using GA
 */

import express from 'express';
import { recommendRecordsGA, getGAStatistics } from '../utils/gaHelper.js';

const router = express.Router();

/**
 * POST /api/ga/recommend
 * Get medical record recommendations using Genetic Algorithm
 */
router.post('/recommend', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        // Only admin can access GA recommendations for now
        if (req.session.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const searchCriteria = {
            file_type: req.body.file_type || '',
            patient_id: req.body.patient_id || '',
            doctor_id: req.body.doctor_id || '',
            // Clinical fields from IPFS
            primary_diagnosis: req.body.primary_diagnosis || '',
            symptoms: req.body.symptoms || '',
            affected_body_parts: req.body.affected_body_parts || '',
            medications: req.body.medications || '',
            treatments: req.body.treatments || '',
            secondary_diagnoses: req.body.secondary_diagnoses || '',
            current_conditions: req.body.current_conditions || '',
            // Demographic fields
            blood_group: req.body.blood_group || '',
            gender: req.body.gender || '',
            age_range: req.body.age_range || ''
        };
        
        const limit = parseInt(req.body.limit) || 10;
        
        console.log('GA Search Request:', searchCriteria);
        
        // Run GA recommendation
        const result = await recommendRecordsGA(searchCriteria, limit);
        
        return res.json(result);
        
    } catch (error) {
        console.error('GA Recommend Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate recommendations',
            details: error.message
        });
    }
});

/**
 * GET /api/ga/statistics
 * Get GA system statistics
 */
router.get('/statistics', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const stats = await getGAStatistics();
        return res.json(stats);
        
    } catch (error) {
        console.error('GA Statistics Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get statistics',
            details: error.message
        });
    }
});

export default router;
