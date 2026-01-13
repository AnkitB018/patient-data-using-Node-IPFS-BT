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
        const analyticsMode = req.body.analyticsMode === true;
        const doctorId = req.session.user.doctor_id;
        
        const searchCriteria = {
            file_type: req.body.file_type || '',
            diagnosis: req.body.primary_diagnosis || req.body.diagnosis || '',
            symptoms: req.body.symptoms || '',
            body_parts: req.body.affected_body_parts || req.body.body_parts || '',
            secondary_diagnosis: req.body.secondary_diagnoses || req.body.secondary_diagnosis || '',
            gender: req.body.gender || '',
            age_range: req.body.age_range || '',
            // Filter by doctor if not analytics mode and user is a doctor
            doctorId: (req.session.user.role === 'doctor' && !analyticsMode) ? doctorId : null
        };
        
        const topN = parseInt(req.body.limit) || 10;
        
        console.log('Multi-Population GA Search Request:', { searchCriteria, analyticsMode });
        
        // Run multi-population GA
        const result = await multiPopulationGA(searchCriteria, topN);
        
        // If analytics mode, return summary only
        if (analyticsMode) {
            const recommendations = result.results.map(r => ({
                diagnosis: r.diagnosis,
                symptoms: r.symptoms,
                body_parts: r.body_parts,
                file_type: r.file_type,
                matchPercentage: parseFloat(r.fitness.toFixed(1))
            }));
            
            // Generate analytics summary
            const summary = generateAnalyticsSummary(recommendations);
            const insights = generateInsights(recommendations, searchCriteria);
            
            return res.json({
                success: true,
                mode: 'analytics',
                summary: summary,
                insights: insights,
                meta: {
                    totalRecordsAnalyzed: result.metrics.recordsEvaluated,
                    samplingEnabled: true,
                    totalEvaluations: result.metrics.recordsEvaluated,
                    generationsRun: result.metrics.generations
                }
            });
        }
        
        // Format response for compatibility (regular mode)
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

function generateAnalyticsSummary(recommendations) {
    const diagnosesMap = {};
    const symptomsMap = {};
    const bodyPartsMap = {};
    const fileTypesMap = {};
    
    recommendations.forEach(rec => {
        // Count diagnoses
        if (rec.diagnosis && rec.diagnosis !== 'N/A') {
            diagnosesMap[rec.diagnosis] = (diagnosesMap[rec.diagnosis] || 0) + 1;
        }
        
        // Count symptoms
        if (rec.symptoms && rec.symptoms !== 'N/A') {
            // Handle both string and array types
            const symptomsStr = Array.isArray(rec.symptoms) ? rec.symptoms.join(',') : String(rec.symptoms);
            const symptomsArray = symptomsStr.split(',').map(s => s.trim());
            symptomsArray.forEach(symptom => {
                if (symptom) symptomsMap[symptom] = (symptomsMap[symptom] || 0) + 1;
            });
        }
        
        // Count body parts
        if (rec.body_parts && rec.body_parts !== 'N/A') {
            // Handle both string and array types
            const partsStr = Array.isArray(rec.body_parts) ? rec.body_parts.join(',') : String(rec.body_parts);
            const partsArray = partsStr.split(',').map(p => p.trim());
            partsArray.forEach(part => {
                if (part) bodyPartsMap[part] = (bodyPartsMap[part] || 0) + 1;
            });
        }
        
        // Count file types
        if (rec.file_type && rec.file_type !== 'N/A') {
            fileTypesMap[rec.file_type] = (fileTypesMap[rec.file_type] || 0) + 1;
        }
    });
    
    const total = recommendations.length;
    
    return {
        diagnoses: Object.entries(diagnosesMap)
            .map(([diagnosis, count]) => ({
                diagnosis,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        
        symptoms: Object.entries(symptomsMap)
            .map(([symptom, count]) => ({
                symptom,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        
        bodyParts: Object.entries(bodyPartsMap)
            .map(([bodyPart, count]) => ({
                bodyPart,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        
        fileTypes: Object.entries(fileTypesMap)
            .map(([fileType, count]) => ({
                fileType,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
    };
}

function generateInsights(recommendations, searchCriteria) {
    const insights = [];
    
    if (recommendations.length > 0) {
        const avgMatch = recommendations.reduce((sum, r) => sum + r.matchPercentage, 0) / recommendations.length;
        insights.push({
            icon: 'bi-graph-up',
            text: `Average match score of ${avgMatch.toFixed(1)}% across ${recommendations.length} best-matching records indicates strong pattern correlation in the database.`
        });
        
        const highMatches = recommendations.filter(r => r.matchPercentage >= 80).length;
        if (highMatches > 0) {
            insights.push({
                icon: 'bi-star-fill',
                text: `Found ${highMatches} high-confidence matches (≥80%) that closely align with your search criteria.`
            });
        }
        
        if (searchCriteria.diagnosis) {
            insights.push({
                icon: 'bi-clipboard-pulse',
                text: `Diagnosis-based search revealed ${recommendations.length} relevant cases from the medical database.`
            });
        }
    }
    
    return insights;
}

export default router;
