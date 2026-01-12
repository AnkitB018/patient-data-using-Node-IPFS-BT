/**
 * Genetic Algorithm Routes
 * API endpoints for medical record recommendation using Multi-Population GA
 */

import express from 'express';
import { multiPopulationGA } from '../utils/gaHelper.js';

const router = express.Router();

/**
 * POST /api/ga/recommend
 * Get medical record recommendations using Multi-Population Genetic Algorithm
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
        
        // Allow both admin and doctor access
        if (req.session.user.role !== 'admin' && req.session.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                error: 'Admin or doctor access required'
            });
        }
        
        const searchCriteria = {
            file_type: req.body.file_type || '',
            diagnosis: req.body.primary_diagnosis || req.body.diagnosis || '',
            symptoms: req.body.symptoms || '',
            body_parts: req.body.affected_body_parts || req.body.body_parts || '',
            secondary_diagnosis: req.body.secondary_diagnoses || req.body.secondary_diagnosis || '',
            gender: req.body.gender || '',
            age_range: req.body.age_range || ''
        };
        
        const topN = parseInt(req.body.limit) || 10;
        
        console.log('Multi-Population GA Search Request:', searchCriteria);
        
        // Run multi-population GA
        const result = await multiPopulationGA(searchCriteria, topN);
        
        // Format response for compatibility
        const response = {
            success: result.success,
            recommendations: result.results.map(r => ({
                block_index: r.block_index,
                matchPercentage: parseFloat(r.fitness.toFixed(1)),
                patient_id: r.patient_id,
                file_type: r.file_type,
                doctor_id: r.doctor,
                primary_diagnosis: r.diagnosis,
                symptoms: r.symptoms,
                affected_body_parts: r.body_parts,
                ipfs_cid: r.ipfs_cid
            })),
            isPersonalized: false,
            samplingEnabled: true,
            totalEvaluations: result.metrics.recordsEvaluated,
            generationsRun: result.metrics.generations,
            totalRecordsAnalyzed: result.metrics.totalRecords
        };
        
        return res.json(response);
        
    } catch (error) {
        console.error('GA Recommend Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate recommendations',
            details: error.message
        });
    }
});

export default router;
