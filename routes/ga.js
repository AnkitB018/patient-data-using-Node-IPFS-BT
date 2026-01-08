/**
 * Genetic Algorithm Routes
 * API endpoints for medical record recommendation using GA
 */

import express from 'express';
import { 
    recommendRecordsGA, 
    recommendRecordsGAAdaptive,
    getGAStatistics,
    evolveWeightsForUser,
    getUserFeedback,
    loadWeightProfile
} from '../utils/gaHelper.js';
import { generateStatisticalSummary, generateClinicalInsights } from '../utils/analyticsHelper.js';
import pool from '../utils/dbHelper.js';

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
        
        // Allow both admin and doctor access
        if (req.session.user.role !== 'admin' && req.session.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                error: 'Admin or doctor access required'
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
        
        // Add doctor access filter if user is a doctor AND not in analytics mode
        const analyticsMode = req.body.analyticsMode === true;
        
        if (req.session.user.role === 'doctor' && !analyticsMode) {
            searchCriteria.doctor_access_filter = req.session.user.doctor_id;
        }
        
        const limit = parseInt(req.body.limit) || 10;
        const useAdaptive = req.body.useAdaptive !== false; // Default to true
        
        console.log('GA Search Request:', searchCriteria);
        console.log('Use Adaptive:', useAdaptive);
        console.log('Analytics Mode:', analyticsMode);
        
        // Run GA recommendation (adaptive or classic)
        let result;
        if (useAdaptive) {
            const userId = req.session.user.role === 'admin' ? 'admin' : req.session.user.doctor_id;
            const userRole = req.session.user.role;
            // For analytics mode, fetch more records for better statistics (50 instead of 10)
            const fetchLimit = analyticsMode ? 50 : limit;
            result = await recommendRecordsGAAdaptive(searchCriteria, fetchLimit, userId, userRole, true);
        } else {
            const fetchLimit = analyticsMode ? 50 : limit;
            result = await recommendRecordsGA(searchCriteria, fetchLimit);
        }
        
        // If analytics mode, generate statistical summary instead of returning records
        if (analyticsMode) {
            if (result.success && result.recommendations && result.recommendations.length > 0) {
                const summary = generateStatisticalSummary(result.recommendations);
                const insights = generateClinicalInsights(summary);
                
                return res.json({
                    success: true,
                    mode: 'analytics',
                    summary: summary,
                    insights: insights,
                    meta: {
                        totalRecordsAnalyzed: summary.totalAnalyzed,
                        confidence: summary.confidence,
                        generationsRun: result.generationsRun || result.config?.generations,
                        totalEvaluations: result.totalEvaluations,
                        samplingEnabled: result.samplingEnabled,
                        isPersonalized: result.isPersonalized
                    }
                });
            } else {
                return res.json({
                    success: false,
                    mode: 'analytics',
                    error: 'No matching records found for analysis'
                });
            }
        }
        
        // Normal mode - return records
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

/**
 * POST /api/ga/feedback
 * Record user feedback on search results
 */
router.post('/feedback', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const { blockIndex, wasUseful, searchCriteria, matchPercentage } = req.body;
        
        const userId = req.session.user.role === 'admin' ? 'admin' : req.session.user.doctor_id;
        const userRole = req.session.user.role;
        
        await pool.query(`
            INSERT INTO ga_search_feedback 
            (user_id, user_role, record_block_index, was_useful, search_criteria, match_percentage)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, userRole, blockIndex, wasUseful, JSON.stringify(searchCriteria || {}), matchPercentage || null]);
        
        console.log(`📝 Feedback recorded: ${userRole} ${userId} - Block ${blockIndex} - ${wasUseful ? '✅ Useful' : '❌ Not useful'}`);
        
        // Clean up old feedback - keep only last 50 items per user
        await pool.query(`
            DELETE FROM ga_search_feedback
            WHERE id IN (
                SELECT id FROM ga_search_feedback
                WHERE user_id = $1 AND user_role = $2
                ORDER BY timestamp DESC
                OFFSET 50
            )
        `, [userId, userRole]);
        
        // Check if we should trigger weight evolution
        const feedbackCount = await pool.query(
            'SELECT COUNT(*) as count FROM ga_search_feedback WHERE user_id = $1 AND user_role = $2',
            [userId, userRole]
        );
        
        const count = parseInt(feedbackCount.rows[0].count);
        let shouldEvolve = false;
        
        // Evolve after 10, 25, 50, 100, etc. feedback items
        if (count === 10 || count === 25 || count === 50 || (count >= 100 && count % 50 === 0)) {
            shouldEvolve = true;
        }
        
        return res.json({
            success: true,
            message: 'Feedback recorded',
            totalFeedback: count,
            willEvolveWeights: shouldEvolve
        });
        
    } catch (error) {
        console.error('Feedback Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to record feedback',
            details: error.message
        });
    }
});

/**
 * POST /api/ga/evolve-weights
 * Manually trigger weight evolution for current user
 */
router.post('/evolve-weights', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const userId = req.session.user.role === 'admin' ? 'admin' : req.session.user.doctor_id;
        const userRole = req.session.user.role;
        
        console.log(`🧬 Manual weight evolution triggered for ${userRole} ${userId}`);
        
        const weights = await evolveWeightsForUser(userId, userRole);
        
        if (!weights) {
            return res.json({
                success: false,
                message: 'Not enough feedback data to evolve weights (minimum 10 required)'
            });
        }
        
        return res.json({
            success: true,
            message: 'Weights evolved successfully',
            weights
        });
        
    } catch (error) {
        console.error('Evolve Weights Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to evolve weights',
            details: error.message
        });
    }
});

/**
 * GET /api/ga/profile
 * Get user's weight profile and feedback stats
 */
router.get('/profile', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const userId = req.session.user.role === 'admin' ? 'admin' : req.session.user.doctor_id;
        const userRole = req.session.user.role;
        
        const weights = await loadWeightProfile(userId, userRole);
        const feedback = await getUserFeedback(userId, userRole);
        
        const profileResult = await pool.query(
            'SELECT * FROM ga_weight_profiles WHERE user_id = $1 AND user_role = $2',
            [userId, userRole]
        );
        
        return res.json({
            success: true,
            hasProfile: weights !== null,
            profile: profileResult.rows[0] || null,
            feedbackCount: feedback.length,
            recentFeedback: feedback.slice(0, 10)
        });
        
    } catch (error) {
        console.error('Profile Route Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get profile',
            details: error.message
        });
    }
});

export default router;
