/**
 * Genetic Algorithm Helper for Medical Record Recommendation
 * 
 * This module implements a Genetic Algorithm to recommend the most relevant
 * medical records based on search criteria (symptoms, conditions, file types, etc.)
 * 
 * GA Components:
 * - Chromosome: A medical record with its attributes
 * - Fitness Function: Calculates relevance score based on multiple factors
 * - Selection: Tournament selection for choosing parent records
 * - Crossover: Feature combination from parent records
 * - Mutation: Random adjustments to maintain diversity
 */

import pool from './dbHelper.js';

// GA Configuration
const GA_CONFIG = {
    POPULATION_SIZE: 50,
    GENERATIONS: 20,
    MUTATION_RATE: 0.1,
    CROSSOVER_RATE: 0.8,
    TOURNAMENT_SIZE: 5,
    ELITE_SIZE: 2
};

// Weights for fitness calculation (prioritized by medical relevance)
const FITNESS_WEIGHTS = {
    EXACT_MATCH: 10.0,                  // Exact keyword match bonus
    PRIMARY_DIAGNOSIS: 9.0,             // Main medical condition (highest clinical priority)
    CONDITION_SIMILARITY: 9.0,          // Similar medical conditions/history
    SYMPTOMS: 7.5,                      // Clinical symptoms matching
    AFFECTED_BODY_PARTS: 7.0,           // Body parts/organs affected
    FILE_TYPE_MATCH: 8.0,               // File type relevance
    MEDICATIONS: 6.5,                   // Medications prescribed
    DOCTOR_MATCH: 6.0,                  // Same doctor treated similar cases
    TREATMENTS: 5.5,                    // Treatments given
    SECONDARY_DIAGNOSES: 5.0,           // Secondary/comorbid conditions
    PARTIAL_MATCH: 5.0,                 // Partial keyword match
    AGE_MATCH: 4.0,                     // Age range demographic matching
    TEMPORAL_RELEVANCE: 3.0,            // Recent records weighted higher
    BLOOD_GROUP: 3.0,                   // Blood group matching
    GENDER: 3.0                         // Gender demographic matching
};

/**
 * Normalize a string for comparison
 */
function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Calculate string similarity using Jaccard index
 */
function calculateSimilarity(str1, str2) {
    const words1 = new Set(normalizeString(str1).split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(normalizeString(str2).split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 && words2.size === 0) return 0;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}

/**
 * Calculate temporal relevance (recent records are more relevant)
 */
function calculateTemporalRelevance(timestamp) {
    const now = new Date();
    const recordDate = new Date(timestamp);
    const daysDiff = (now - recordDate) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: recent = 1.0, 1 year old = 0.5, 2+ years = 0.25
    if (daysDiff < 0) return 1.0;
    if (daysDiff < 30) return 1.0;
    if (daysDiff < 180) return 0.9;
    if (daysDiff < 365) return 0.7;
    if (daysDiff < 730) return 0.5;
    return 0.25;
}

/**
 * Calculate fitness score for a record based on search criteria
 */
function calculateFitness(record, searchCriteria) {
    let fitness = 0;
    let maxPossibleScore = 0;
    
    // Helper function for text similarity matching with exact match bonus
    const matchTextField = (searchText, recordText, baseWeight, exactMatchBonus = true) => {
        if (!searchText || !searchText.trim()) return { fitness: 0, maxScore: 0 };
        if (!recordText || !recordText.trim()) return { fitness: 0, maxScore: baseWeight };
        
        let localFitness = 0;
        let localMaxScore = 0;
        
        // Normalize both texts
        const searchNorm = normalizeString(searchText);
        const recordNorm = normalizeString(recordText);
        
        // Extract individual search terms (split by comma, space, etc.)
        const searchTerms = searchNorm.split(/[,\s]+/).filter(t => t.length > 2);
        const recordTerms = recordNorm.split(/[,\s]+/).filter(t => t.length > 2);
        
        if (searchTerms.length === 0) return { fitness: 0, maxScore: 0 };
        if (recordTerms.length === 0) return { fitness: 0, maxScore: baseWeight };
        
        // Score each search term individually
        searchTerms.forEach(searchTerm => {
            let termMatched = false;
            let bestMatchScore = 0;
            
            // Check against each record term
            for (const recordTerm of recordTerms) {
                // Exact match - full score
                if (recordTerm === searchTerm) {
                    bestMatchScore = 1.0;
                    termMatched = true;
                    break;
                }
                // Partial match - one contains the other
                else if (recordTerm.includes(searchTerm) || searchTerm.includes(recordTerm)) {
                    bestMatchScore = Math.max(bestMatchScore, 0.8); // Partial match gets 80%
                    termMatched = true;
                }
            }
            
            // Add score for this search term
            if (termMatched) {
                localFitness += bestMatchScore * baseWeight;
            }
            localMaxScore += baseWeight; // Each search term can contribute full weight
        });
        
        return { fitness: localFitness, maxScore: localMaxScore };
    };
    
    // 1. PRIMARY DIAGNOSIS (Highest clinical priority - 9.0)
    if (searchCriteria.primary_diagnosis && searchCriteria.primary_diagnosis.trim()) {
        const result = matchTextField(
            searchCriteria.primary_diagnosis,
            record.primary_diagnosis,
            FITNESS_WEIGHTS.PRIMARY_DIAGNOSIS,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 2. SYMPTOMS (Very High priority - 7.5)
    if (searchCriteria.symptoms && searchCriteria.symptoms.trim()) {
        const recordSymptoms = typeof record.symptoms === 'string' ? record.symptoms : 
                              (Array.isArray(record.symptoms) ? record.symptoms.join(', ') : '');
        const result = matchTextField(
            searchCriteria.symptoms,
            recordSymptoms,
            FITNESS_WEIGHTS.SYMPTOMS,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 3. AFFECTED BODY PARTS (High priority - 7.0)
    if (searchCriteria.affected_body_parts && searchCriteria.affected_body_parts.trim()) {
        const recordBodyParts = typeof record.affected_body_parts === 'string' ? record.affected_body_parts :
                               (Array.isArray(record.affected_body_parts) ? record.affected_body_parts.join(', ') : '');
        const result = matchTextField(
            searchCriteria.affected_body_parts,
            recordBodyParts,
            FITNESS_WEIGHTS.AFFECTED_BODY_PARTS,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 4. FILE TYPE MATCH (High priority - 8.0)
    if (searchCriteria.file_type && searchCriteria.file_type.trim()) {
        maxPossibleScore += FITNESS_WEIGHTS.FILE_TYPE_MATCH;
        const searchFileType = normalizeString(searchCriteria.file_type);
        const recordFileType = normalizeString(record.file_type);
        
        if (recordFileType === searchFileType) {
            fitness += FITNESS_WEIGHTS.FILE_TYPE_MATCH;
        } else if (recordFileType.includes(searchFileType) || searchFileType.includes(recordFileType)) {
            fitness += FITNESS_WEIGHTS.FILE_TYPE_MATCH * 0.5;
        }
    }
    
    // 5. MEDICATIONS (Medium-High priority - 6.5)
    if (searchCriteria.medications && searchCriteria.medications.trim()) {
        const recordMedications = typeof record.medications === 'string' ? record.medications :
                                 (Array.isArray(record.medications) ? record.medications.join(', ') : '');
        const result = matchTextField(
            searchCriteria.medications,
            recordMedications,
            FITNESS_WEIGHTS.MEDICATIONS,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 6. DOCTOR MATCH (Medium-High priority - 6.0)
    if (searchCriteria.doctor_id && searchCriteria.doctor_id.trim()) {
        maxPossibleScore += FITNESS_WEIGHTS.DOCTOR_MATCH;
        if (record.doc && record.doc.toString() === searchCriteria.doctor_id.toString()) {
            fitness += FITNESS_WEIGHTS.DOCTOR_MATCH;
        }
    }
    
    // 7. TREATMENTS (Medium priority - 5.5)
    if (searchCriteria.treatments && searchCriteria.treatments.trim()) {
        const recordTreatments = typeof record.treatments === 'string' ? record.treatments :
                                (Array.isArray(record.treatments) ? record.treatments.join(', ') : '');
        const result = matchTextField(
            searchCriteria.treatments,
            recordTreatments,
            FITNESS_WEIGHTS.TREATMENTS,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 8. SECONDARY DIAGNOSES (Medium priority - 5.0)
    if (searchCriteria.secondary_diagnoses && searchCriteria.secondary_diagnoses.trim()) {
        const recordSecondary = typeof record.secondary_diagnoses === 'string' ? record.secondary_diagnoses :
                               (Array.isArray(record.secondary_diagnoses) ? record.secondary_diagnoses.join(', ') : '');
        const result = matchTextField(
            searchCriteria.secondary_diagnoses,
            recordSecondary,
            FITNESS_WEIGHTS.SECONDARY_DIAGNOSES,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 9. CURRENT CONDITIONS / GENERAL MEDICAL HISTORY (Medium priority - 9.0)
    if (searchCriteria.current_conditions && searchCriteria.current_conditions.trim()) {
        const result = matchTextField(
            searchCriteria.current_conditions,
            record.current_conditions,
            FITNESS_WEIGHTS.CONDITION_SIMILARITY,
            true
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    // 10. PATIENT MATCH (if searching for specific patient's records)
    if (searchCriteria.patient_id && searchCriteria.patient_id.trim()) {
        if (record.patient_id && record.patient_id.toString() === searchCriteria.patient_id.toString()) {
            fitness += FITNESS_WEIGHTS.PARTIAL_MATCH;
            maxPossibleScore += FITNESS_WEIGHTS.PARTIAL_MATCH;
        }
    }
    
    // 11. AGE RANGE MATCH (Low-Medium priority - 4.0)
    if (searchCriteria.age_range && searchCriteria.age_range.trim() && record.date_of_birth) {
        maxPossibleScore += FITNESS_WEIGHTS.AGE_MATCH;
        
        const dob = new Date(record.date_of_birth);
        const now = new Date();
        const age = Math.floor((now - dob) / (365.25 * 24 * 60 * 60 * 1000));
        
        const [minAge, maxAge] = searchCriteria.age_range.split('-').map(Number);
        if (age >= minAge && age <= maxAge) {
            fitness += FITNESS_WEIGHTS.AGE_MATCH;
        }
    }
    
    // 12. TEMPORAL RELEVANCE (Low priority - 3.0, always calculated)
    maxPossibleScore += FITNESS_WEIGHTS.TEMPORAL_RELEVANCE;
    const temporalScore = calculateTemporalRelevance(record.timestamp);
    fitness += temporalScore * FITNESS_WEIGHTS.TEMPORAL_RELEVANCE;
    
    // 13. BLOOD GROUP MATCH (Low priority - 3.0)
    if (searchCriteria.blood_group && searchCriteria.blood_group.trim()) {
        maxPossibleScore += FITNESS_WEIGHTS.BLOOD_GROUP;
        if (record.blood_group && normalizeString(record.blood_group) === normalizeString(searchCriteria.blood_group)) {
            fitness += FITNESS_WEIGHTS.BLOOD_GROUP;
        }
    }
    
    // 14. GENDER MATCH (Low priority - 3.0)
    if (searchCriteria.gender && searchCriteria.gender.trim()) {
        maxPossibleScore += FITNESS_WEIGHTS.GENDER;
        if (record.gender && normalizeString(record.gender) === normalizeString(searchCriteria.gender)) {
            fitness += FITNESS_WEIGHTS.GENDER;
        }
    }
    
    // Avoid division by zero
    if (maxPossibleScore === 0) return 0;
    
    // Return normalized fitness (0-1 scale) and raw score
    return {
        normalizedFitness: fitness / maxPossibleScore,
        rawScore: fitness,
        maxScore: maxPossibleScore,
        percentage: Math.round((fitness / maxPossibleScore) * 100)
    };
}

/**
 * Tournament selection - select best individual from random tournament
 */
function tournamentSelection(population, fitnessScores) {
    let best = null;
    let bestFitness = -1;
    
    for (let i = 0; i < GA_CONFIG.TOURNAMENT_SIZE; i++) {
        const randomIndex = Math.floor(Math.random() * population.length);
        const candidate = population[randomIndex];
        const candidateFitness = fitnessScores[randomIndex].normalizedFitness;
        
        if (candidateFitness > bestFitness) {
            best = candidate;
            bestFitness = candidateFitness;
        }
    }
    
    return best;
}

/**
 * Crossover - combine features from two parent records (not used in record recommendation)
 * This is kept for GA completeness but may not apply directly to fixed medical records
 */
function crossover(parent1, parent2) {
    if (Math.random() > GA_CONFIG.CROSSOVER_RATE) {
        return Math.random() < 0.5 ? parent1 : parent2;
    }
    
    // For medical records, we just return one of the parents
    // as we can't "combine" actual historical records
    return Math.random() < 0.5 ? parent1 : parent2;
}

/**
 * Mutation - introduce small random changes (not applicable to fixed records)
 * This is kept for GA completeness but doesn't modify actual medical records
 */
function mutate(record) {
    if (Math.random() < GA_CONFIG.MUTATION_RATE) {
        // In a true GA, we'd modify the record
        // For medical records, we keep them unchanged
        return record;
    }
    return record;
}

/**
 * Main Genetic Algorithm for Medical Record Recommendation
 */
export async function recommendRecordsGA(searchCriteria, limit = 10) {
    try {
        // Import IPFS helper
        const { fetchFromIPFS } = await import('./ipfsHelper.js');
        
        // Fetch all medical records from database (excluding genesis block)
        const query = `
            SELECT 
                bm.block_hash,
                bm.block_index,
                bm.timestamp,
                bm.ipfs_cid,
                bm.patient_id,
                bm.file_type,
                bm.file_status,
                bm.doc,
                p.username as patient_username,
                p.gender,
                p.blood_group,
                p.date_of_birth,
                p.current_conditions,
                d.username as doctor_username
            FROM blockchain_metadata bm
            LEFT JOIN patients p ON bm.patient_id = p.patient_id
            LEFT JOIN doctors d ON bm.doc = d.doctor_id
            WHERE bm.block_index IS NOT NULL 
              AND bm.block_index > 0
              AND bm.patient_id IS NOT NULL
            ORDER BY bm.timestamp DESC
        `;
        
        const result = await pool.query(query);
        let population = result.rows;
        
        console.log(`GA: Fetched ${population.length} records from database`);
        
        if (population.length === 0) {
            return {
                success: true,
                recommendations: [],
                message: 'No medical records found in database',
                algorithm: 'Genetic Algorithm',
                generations: 0,
                totalRecordsAnalyzed: 0
            };
        }
        
        // Phase 1: Quick filter based on metadata only (if specific filters provided)
        const needsIPFSData = searchCriteria.primary_diagnosis || searchCriteria.symptoms || 
                             searchCriteria.affected_body_parts || searchCriteria.medications ||
                             searchCriteria.treatments || searchCriteria.secondary_diagnoses;
        
        // If searching by IPFS fields, we MUST fetch IPFS data for all records first
        if (needsIPFSData) {
            console.log(`GA: Fetching IPFS data for all ${population.length} records (searching by clinical fields)`);
            
            // Fetch IPFS data for all records in parallel (with some concurrency control)
            const batchSize = 5; // Process 5 at a time to avoid overwhelming IPFS
            for (let i = 0; i < population.length; i += batchSize) {
                const batch = population.slice(i, i + batchSize);
                await Promise.all(batch.map(async (record) => {
                    try {
                        if (record.ipfs_cid) {
                            const ipfsData = await fetchFromIPFS(record.ipfs_cid);
                            if (ipfsData) {
                                console.log(`Block ${record.block_index} raw IPFS data:`, {
                                    symptoms: ipfsData.symptoms,
                                    primary_diagnosis: ipfsData.primary_diagnosis,
                                    affected_body_parts: ipfsData.affected_body_parts,
                                    treatments: ipfsData.treatments,
                                    treatments_given: ipfsData.treatments_given,
                                    medications: ipfsData.medications
                                });
                                
                                // Merge IPFS data into record
                                record.symptoms = Array.isArray(ipfsData.symptoms) ? ipfsData.symptoms.join(', ') : (ipfsData.symptoms || '');
                                record.primary_diagnosis = ipfsData.primary_diagnosis || '';
                                record.secondary_diagnoses = Array.isArray(ipfsData.secondary_diagnoses) ? ipfsData.secondary_diagnoses.join(', ') : (ipfsData.secondary_diagnoses || '');
                                record.affected_body_parts = Array.isArray(ipfsData.affected_body_parts) ? ipfsData.affected_body_parts.join(', ') : (ipfsData.affected_body_parts || '');
                                record.treatments = Array.isArray(ipfsData.treatments_given) ? ipfsData.treatments_given.join(', ') : 
                                                   (Array.isArray(ipfsData.treatments) ? ipfsData.treatments.join(', ') : 
                                                   (ipfsData.treatments_given || ipfsData.treatments || ''));
                                record.medications = Array.isArray(ipfsData.medications) ? ipfsData.medications.join(', ') : (ipfsData.medications || '');
                                
                                console.log(`Block ${record.block_index} processed:`, {
                                    symptoms: record.symptoms,
                                    primary_diagnosis: record.primary_diagnosis,
                                    affected_body_parts: record.affected_body_parts,
                                    treatments: record.treatments,
                                    medications: record.medications
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to fetch IPFS for CID ${record.ipfs_cid}:`, error.message);
                    }
                }));
            }
            console.log(`GA: IPFS data fetched for all records`);
        }
        
        // Calculate fitness scores with complete data (including IPFS if fetched)
        let fitnessScores = population.map(record => {
            const fitness = calculateFitness(record, searchCriteria);
            return {
                record,
                ...fitness
            };
        });
        
        // Sort by fitness
        fitnessScores.sort((a, b) => b.normalizedFitness - a.normalizedFitness);
        
        console.log(`GA: Calculated fitness for ${fitnessScores.length} records`);
        console.log('Search criteria:', {
            symptoms: searchCriteria.symptoms || 'none',
            primary_diagnosis: searchCriteria.primary_diagnosis || 'none',
            affected_body_parts: searchCriteria.affected_body_parts || 'none',
            treatments: searchCriteria.treatments || 'none',
            medications: searchCriteria.medications || 'none'
        });
        
        // Log top 3 scores for debugging
        if (fitnessScores.length > 0) {
            console.log('Top 3 matches:');
            fitnessScores.slice(0, 3).forEach((result, idx) => {
                console.log(`  ${idx + 1}. Block ${result.record.block_index}: ${result.percentage}% (${result.rawScore.toFixed(1)}/${result.maxScore.toFixed(1)})`);
                console.log(`     Record has - symptoms: ${result.record.symptoms ? 'YES' : 'NO'}, treatments: ${result.record.treatments ? 'YES' : 'NO'}`);
            });
        }
        
        // Get top unique results by block_index
        const seenBlockIndices = new Set();
        const uniqueResults = [];
        
        for (const result of fitnessScores) {
            const blockIndex = result.record.block_index;
            if (!seenBlockIndices.has(blockIndex) && result.percentage > 0) {
                seenBlockIndices.add(blockIndex);
                uniqueResults.push(result);
                if (uniqueResults.length >= limit) break;
            }
        }
        
        console.log(`GA: Found ${uniqueResults.length} unique relevant records`);
        
        return {
            success: true,
            recommendations: uniqueResults.map(r => ({
                block_hash: r.record.block_hash,
                block_index: r.record.block_index,
                timestamp: r.record.timestamp,
                ipfs_cid: r.record.ipfs_cid,
                patient_id: r.record.patient_id,
                patient_username: r.record.patient_username,
                file_type: r.record.file_type,
                file_status: r.record.file_status,
                doctor_id: r.record.doc,
                doctor_username: r.record.doctor_username,
                gender: r.record.gender,
                blood_group: r.record.blood_group,
                current_conditions: r.record.current_conditions,
                matchPercentage: r.percentage,
                fitnessScore: r.normalizedFitness.toFixed(4),
                rawScore: r.rawScore.toFixed(2),
                maxScore: r.maxScore.toFixed(2)
            })),
            algorithm: 'Genetic Algorithm',
            config: {
                populationSize: population.length,
                generations: 1,
                mutationRate: GA_CONFIG.MUTATION_RATE,
                crossoverRate: GA_CONFIG.CROSSOVER_RATE,
                tournamentSize: GA_CONFIG.TOURNAMENT_SIZE
            },
            searchCriteria: searchCriteria,
            totalRecordsAnalyzed: population.length
        };
        
    } catch (error) {
        console.error('GA Recommendation Error:', error);
        return {
            success: false,
            error: error.message,
            recommendations: []
        };
    }
}

/**
 * Get statistics about the GA search
 */
export async function getGAStatistics() {
    try {
        // Count only valid records (exclude genesis block and null patients)
        const totalRecordsQuery = await pool.query(`
            SELECT COUNT(*) FROM blockchain_metadata 
            WHERE block_index > 0 AND patient_id IS NOT NULL
        `);
        const totalRecords = parseInt(totalRecordsQuery.rows[0].count);
        
        const fileTypesQuery = await pool.query(`
            SELECT file_type, COUNT(*) as count 
            FROM blockchain_metadata 
            WHERE block_index > 0 AND patient_id IS NOT NULL
            GROUP BY file_type 
            ORDER BY count DESC
        `);
        
        return {
            success: true,
            totalRecords,
            fileTypes: fileTypesQuery.rows,
            gaConfig: GA_CONFIG,
            fitnessWeights: FITNESS_WEIGHTS
        };
    } catch (error) {
        console.error('GA Statistics Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
