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

// ============================================================================
// ADAPTIVE LEARNING SYSTEM
// ============================================================================

/**
 * Load personalized weight profile for a user, or return defaults
 */
async function loadWeightProfile(userId, userRole) {
    try {
        const result = await pool.query(
            'SELECT weights FROM ga_weight_profiles WHERE user_id = $1 AND user_role = $2',
            [userId, userRole]
        );
        
        if (result.rows.length > 0) {
            console.log(`📊 Loaded personalized weights for ${userRole} ${userId}`);
            return result.rows[0].weights;
        }
        
        console.log(`📊 Using default weights for ${userRole} ${userId} (no profile yet)`);
        return null; // Will use FITNESS_WEIGHTS
    } catch (error) {
        console.error('Error loading weight profile:', error);
        return null;
    }
}

/**
 * Save or update weight profile for a user
 */
async function saveWeightProfile(userId, userRole, weights, fitnessScore, numFeedback) {
    try {
        await pool.query(`
            INSERT INTO ga_weight_profiles 
            (user_id, user_role, weights, fitness_score, num_feedback_items, last_updated)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, user_role) 
            DO UPDATE SET 
                weights = $3,
                fitness_score = $4,
                num_feedback_items = $5,
                num_searches = ga_weight_profiles.num_searches + 1,
                last_updated = NOW()
        `, [userId, userRole, JSON.stringify(weights), fitnessScore, numFeedback]);
        
        console.log(`💾 Saved weight profile for ${userRole} ${userId} (fitness: ${fitnessScore.toFixed(3)})`);
    } catch (error) {
        console.error('Error saving weight profile:', error);
    }
}

/**
 * Get all feedback for a user
 */
async function getUserFeedback(userId, userRole) {
    try {
        const result = await pool.query(`
            SELECT 
                record_block_index,
                was_useful,
                search_criteria,
                match_percentage,
                timestamp
            FROM ga_search_feedback
            WHERE user_id = $1 AND user_role = $2
            ORDER BY timestamp DESC
        `, [userId, userRole]);
        
        return result.rows;
    } catch (error) {
        console.error('Error getting user feedback:', error);
        return [];
    }
}

/**
 * Evolve optimal weights for a user based on their feedback
 * Uses GA to find weights that best predict user's "useful" ratings
 */
async function evolveWeightsForUser(userId, userRole) {
    console.log(`\n🧬 Evolving weights for ${userRole} ${userId}...`);
    
    try {
        // Get user's feedback history
        const feedback = await getUserFeedback(userId, userRole);
        
        if (feedback.length < 10) {
            console.log(`⚠️ Not enough feedback yet (${feedback.length}/10 minimum)`);
            return null;
        }
        
        console.log(`📊 Analyzing ${feedback.length} feedback items...`);
        
        // Separate useful and not useful records
        const usefulRecords = feedback.filter(f => f.was_useful).map(f => f.record_block_index);
        const notUsefulRecords = feedback.filter(f => !f.was_useful).map(f => f.record_block_index);
        
        console.log(`   ✅ Useful: ${usefulRecords.length} | ❌ Not useful: ${notUsefulRecords.length}`);
        
        if (usefulRecords.length < 3) {
            console.log(`⚠️ Not enough positive feedback (${usefulRecords.length}/3 minimum)`);
            return null;
        }
        
        // Fetch the actual records for fitness calculation
        const allBlockIndices = [...usefulRecords, ...notUsefulRecords];
        const recordsResult = await pool.query(`
            SELECT 
                bm.block_index,
                bm.file_type,
                bm.patient_id,
                p.current_conditions,
                p.blood_group,
                p.gender
            FROM blockchain_metadata bm
            LEFT JOIN patients p ON bm.patient_id = p.patient_id
            WHERE bm.block_index = ANY($1)
        `, [allBlockIndices]);
        
        const recordsMap = {};
        recordsResult.rows.forEach(r => {
            recordsMap[r.block_index] = r;
        });
        
        // Initialize population of weight configurations
        const populationSize = 30;
        let population = [];
        
        // Add default weights as one candidate
        population.push({...FITNESS_WEIGHTS});
        
        // Generate random variations
        for (let i = 1; i < populationSize; i++) {
            const weights = {};
            Object.keys(FITNESS_WEIGHTS).forEach(key => {
                // Random weight between 0.5x and 1.5x the default
                const defaultWeight = FITNESS_WEIGHTS[key];
                weights[key] = defaultWeight * (0.5 + Math.random());
            });
            population.push(weights);
        }
        
        // Evolve for multiple generations
        const generations = 15;
        let bestWeights = null;
        let bestFitness = -Infinity;
        
        for (let gen = 0; gen < generations; gen++) {
            // Evaluate fitness of each weight configuration
            const fitnessScores = population.map(weights => {
                return evaluateWeightFitness(weights, usefulRecords, notUsefulRecords, recordsMap, feedback);
            });
            
            // Track best
            const maxFitness = Math.max(...fitnessScores);
            const maxIndex = fitnessScores.indexOf(maxFitness);
            
            if (maxFitness > bestFitness) {
                bestFitness = maxFitness;
                bestWeights = {...population[maxIndex]};
            }
            
            if (gen % 5 === 0) {
                console.log(`   Generation ${gen}: Best fitness = ${maxFitness.toFixed(3)}`);
            }
            
            // Selection and reproduction
            const newPopulation = [];
            
            // Elitism - keep best 2
            const sortedIndices = fitnessScores
                .map((fitness, idx) => ({fitness, idx}))
                .sort((a, b) => b.fitness - a.fitness);
            
            newPopulation.push({...population[sortedIndices[0].idx]});
            newPopulation.push({...population[sortedIndices[1].idx]});
            
            // Generate rest through tournament selection and mutation
            while (newPopulation.length < populationSize) {
                // Tournament selection
                const parent = tournamentSelectWeights(population, fitnessScores, 3);
                
                // Mutate
                const child = {};
                Object.keys(parent).forEach(key => {
                    if (Math.random() < 0.2) { // 20% mutation rate
                        child[key] = parent[key] * (0.8 + Math.random() * 0.4); // ±20% variation
                    } else {
                        child[key] = parent[key];
                    }
                });
                
                newPopulation.push(child);
            }
            
            population = newPopulation;
        }
        
        console.log(`✅ Evolution complete! Best fitness: ${bestFitness.toFixed(3)}`);
        console.log(`   Top weight changes:`);
        
        // Show which weights changed most
        const changes = [];
        Object.keys(bestWeights).forEach(key => {
            const change = ((bestWeights[key] - FITNESS_WEIGHTS[key]) / FITNESS_WEIGHTS[key] * 100);
            if (Math.abs(change) > 5) {
                changes.push({key, change, newValue: bestWeights[key]});
            }
        });
        
        changes
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .slice(0, 5)
            .forEach(c => {
                const sign = c.change > 0 ? '+' : '';
                console.log(`   ${c.key}: ${sign}${c.change.toFixed(1)}% → ${c.newValue.toFixed(2)}`);
            });
        
        // Save the evolved weights
        await saveWeightProfile(userId, userRole, bestWeights, bestFitness, feedback.length);
        
        return bestWeights;
        
    } catch (error) {
        console.error('Error evolving weights:', error);
        return null;
    }
}

/**
 * Evaluate how well a weight configuration predicts user preferences
 */
function evaluateWeightFitness(weights, usefulRecords, notUsefulRecords, recordsMap, feedback) {
    let score = 0;
    let totalEvaluated = 0;
    
    // For each useful record, it should score high
    usefulRecords.forEach(blockIndex => {
        const record = recordsMap[blockIndex];
        if (!record) return;
        
        const feedbackItem = feedback.find(f => f.record_block_index === blockIndex);
        const searchCriteria = feedbackItem?.search_criteria || {};
        
        // Calculate what the match percentage would be with these weights
        const mockFitness = calculateMockFitness(record, searchCriteria, weights);
        
        // Higher is better for useful records
        score += mockFitness;
        totalEvaluated++;
    });
    
    // For each not-useful record, it should score low
    notUsefulRecords.forEach(blockIndex => {
        const record = recordsMap[blockIndex];
        if (!record) return;
        
        const feedbackItem = feedback.find(f => f.record_block_index === blockIndex);
        const searchCriteria = feedbackItem?.search_criteria || {};
        
        const mockFitness = calculateMockFitness(record, searchCriteria, weights);
        
        // Lower is better for not-useful records (penalty)
        score -= mockFitness * 0.5;
        totalEvaluated++;
    });
    
    return totalEvaluated > 0 ? score / totalEvaluated : 0;
}

/**
 * Calculate a simplified fitness score for weight evaluation
 */
function calculateMockFitness(record, searchCriteria, weights) {
    let fitness = 0;
    
    // File type match
    if (searchCriteria.file_type && record.file_type === searchCriteria.file_type) {
        fitness += weights.FILE_TYPE_MATCH || 0;
    }
    
    // Condition match
    if (searchCriteria.current_conditions && record.current_conditions) {
        if (record.current_conditions.toLowerCase().includes(searchCriteria.current_conditions.toLowerCase())) {
            fitness += weights.CONDITION_SIMILARITY || 0;
        }
    }
    
    // Blood group match
    if (searchCriteria.blood_group && record.blood_group === searchCriteria.blood_group) {
        fitness += weights.BLOOD_GROUP || 0;
    }
    
    // Gender match
    if (searchCriteria.gender && record.gender === searchCriteria.gender) {
        fitness += weights.GENDER || 0;
    }
    
    return fitness;
}

/**
 * Tournament selection for weight evolution
 */
function tournamentSelectWeights(population, fitnessScores, tournamentSize) {
    let best = null;
    let bestFitness = -Infinity;
    
    for (let i = 0; i < tournamentSize; i++) {
        const idx = Math.floor(Math.random() * population.length);
        if (fitnessScores[idx] > bestFitness) {
            bestFitness = fitnessScores[idx];
            best = population[idx];
        }
    }
    
    return {...best};
}

// ============================================================================
// SMART SAMPLING SYSTEM  
// ============================================================================

/**
 * Smart sampling: Don't evaluate all records, intelligently sample subsets
 */
function smartSamplePopulation(population, generation, eliteRecords = [], samplingRate = 0.3) {
    const sampleSize = Math.ceil(population.length * samplingRate);
    
    if (generation === 1 || eliteRecords.length === 0) {
        // First generation: Random sampling
        return randomSample(population, sampleSize);
    }
    
    // Subsequent generations: Guided sampling around elite records
    return guidedSample(population, eliteRecords, sampleSize);
}

/**
 * Random sampling for initial generation
 */
function randomSample(population, sampleSize) {
    const shuffled = [...population].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
}

/**
 * Guided sampling: Sample records similar to elite records
 */
function guidedSample(population, eliteRecords, sampleSize) {
    const sampled = new Set();
    const result = [];
    
    // Always include elite records
    eliteRecords.forEach(record => {
        if (result.length < sampleSize) {
            sampled.add(record.block_index);
            result.push(record);
        }
    });
    
    // Extract patterns from elite records
    const eliteFileTypes = eliteRecords.map(r => r.file_type).filter(Boolean);
    const elitePatients = eliteRecords.map(r => r.patient_id).filter(Boolean);
    
    // Sample records with similar characteristics
    const similarRecords = population.filter(record => {
        if (sampled.has(record.block_index)) return false;
        
        // Prefer same file type
        if (eliteFileTypes.includes(record.file_type)) return true;
        
        // Prefer same patients
        if (elitePatients.includes(record.patient_id)) return true;
        
        // Random chance for exploration
        return Math.random() < 0.3;
    });
    
    // Add similar records
    const shuffledSimilar = [...similarRecords].sort(() => Math.random() - 0.5);
    for (const record of shuffledSimilar) {
        if (result.length >= sampleSize) break;
        if (!sampled.has(record.block_index)) {
            sampled.add(record.block_index);
            result.push(record);
        }
    }
    
    // Fill remaining with random records if needed
    if (result.length < sampleSize) {
        const remaining = population.filter(r => !sampled.has(r.block_index));
        const shuffledRemaining = [...remaining].sort(() => Math.random() - 0.5);
        
        for (const record of shuffledRemaining) {
            if (result.length >= sampleSize) break;
            result.push(record);
        }
    }
    
    return result;
}

// ============================================================================
// ORIGINAL GA CONFIGURATION
// ============================================================================

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
        
        // Build WHERE clause for doctor access filter
        let whereClause = `
            WHERE bm.block_index IS NOT NULL 
              AND bm.block_index > 0
              AND bm.patient_id IS NOT NULL
        `;
        
        const queryParams = [];
        
        // If doctor access filter is provided, restrict to doctor's accessible records
        if (searchCriteria.doctor_access_filter) {
            whereClause += `
              AND (
                bm.doc = $1
                OR bm.patient_id IN (
                    SELECT patient_id FROM consent_records 
                    WHERE granted_doctor = $1
                )
              )
            `;
            queryParams.push(searchCriteria.doctor_access_filter);
        }
        
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
            ${whereClause}
            ORDER BY bm.timestamp DESC
        `;
        
        const result = queryParams.length > 0 
            ? await pool.query(query, queryParams)
            : await pool.query(query);
        let population = result.rows;
        
        console.log(`GA: Fetched ${population.length} records from database` + 
                   (searchCriteria.doctor_access_filter ? ` (filtered for doctor ${searchCriteria.doctor_access_filter})` : ''));
        
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

// ============================================================================
// ADAPTIVE GA WITH SMART SAMPLING (NEW VERSION)
// ============================================================================

/**
 * Enhanced GA with adaptive weights and smart sampling
 * @param {Object} searchCriteria - Search parameters
 * @param {number} limit - Number of results to return
 * @param {string} userId - User ID for personalized weights
 * @param {string} userRole - User role (admin/doctor)
 * @param {boolean} useSmartSampling - Enable smart sampling (default: true)
 */
export async function recommendRecordsGAAdaptive(searchCriteria, limit = 10, userId = null, userRole = null, useSmartSampling = true) {
    const startTime = Date.now();
    
    try {
        console.log(`\n🧬 Starting Adaptive GA Search...`);
        console.log(`   User: ${userRole} ${userId}`);
        console.log(`   Smart Sampling: ${useSmartSampling ? 'ENABLED' : 'DISABLED'}`);
        
        // Load personalized weights if user provided
        let weights = FITNESS_WEIGHTS;
        let isPersonalized = false;
        
        if (userId && userRole) {
            const personalizedWeights = await loadWeightProfile(userId, userRole);
            if (personalizedWeights) {
                weights = personalizedWeights;
                isPersonalized = true;
            }
        }
        
        // Import IPFS helper
        const { fetchFromIPFS } = await import('./ipfsHelper.js');
        
        // Build WHERE clause for doctor access filter
        let whereClause = `
            WHERE bm.block_index IS NOT NULL 
              AND bm.block_index > 0
              AND bm.patient_id IS NOT NULL
        `;
        
        const queryParams = [];
        
        if (searchCriteria.doctor_access_filter) {
            whereClause += `
              AND (
                bm.doc = $1
                OR bm.patient_id IN (
                    SELECT patient_id FROM consent_records 
                    WHERE granted_doctor = $1
                )
              )
            `;
            queryParams.push(searchCriteria.doctor_access_filter);
        }
        
        // Fetch records
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
            ${whereClause}
            ORDER BY bm.timestamp DESC
        `;
        
        const result = queryParams.length > 0 
            ? await pool.query(query, queryParams)
            : await pool.query(query);
        
        let fullPopulation = result.rows;
        const totalRecords = fullPopulation.length;
        
        console.log(`   📊 Total records available: ${totalRecords}`);
        console.log(`   🎯 Using ${isPersonalized ? 'PERSONALIZED' : 'DEFAULT'} weights`);
        
        if (totalRecords === 0) {
            return {
                success: true,
                recommendations: [],
                message: 'No medical records found',
                algorithm: 'Adaptive GA',
                totalRecordsAnalyzed: 0,
                isPersonalized,
                config: { ...GA_CONFIG, samplingEnabled: useSmartSampling }
            };
        }
        
        // Check if IPFS data needed
        const needsIPFSData = searchCriteria.primary_diagnosis || searchCriteria.symptoms || 
                             searchCriteria.affected_body_parts || searchCriteria.medications ||
                             searchCriteria.treatments || searchCriteria.secondary_diagnoses;
        
        // Evolution loop with smart sampling
        let population = fullPopulation;
        let eliteRecords = [];
        let totalEvaluated = 0;
        const generations = useSmartSampling ? GA_CONFIG.GENERATIONS : 1;
        
        for (let gen = 1; gen <= generations; gen++) {
            let currentGeneration;
            
            if (useSmartSampling && gen > 1 && totalRecords > 100) {
                // Smart sampling: Only evaluate subset
                const samplingRate = gen === 1 ? 0.3 : 0.25;
                currentGeneration = smartSamplePopulation(fullPopulation, gen, eliteRecords, samplingRate);
                console.log(`   Gen ${gen}: Sampling ${currentGeneration.length}/${totalRecords} records`);
            } else {
                // First generation or small dataset: Use all
                currentGeneration = fullPopulation;
                if (gen === 1) {
                    console.log(`   Gen ${gen}: Evaluating all ${currentGeneration.length} records`);
                }
            }
            
            // Fetch IPFS data if needed for this generation
            if (needsIPFSData) {
                const batchSize = 5;
                const IPFS_TIMEOUT = 8000; // 8 seconds per IPFS fetch
                
                for (let i = 0; i < currentGeneration.length; i += batchSize) {
                    const batch = currentGeneration.slice(i, i + batchSize);
                    try {
                        // Add timeout to entire batch
                        await Promise.race([
                            Promise.all(batch.map(async (record) => {
                                try {
                                    if (record.ipfs_cid && !record.ipfsDataFetched) {
                                        // Add timeout to individual fetch
                                        const fetchPromise = fetchFromIPFS(record.ipfs_cid);
                                        const timeoutPromise = new Promise((_, reject) => 
                                            setTimeout(() => reject(new Error('IPFS timeout')), IPFS_TIMEOUT)
                                        );
                                        
                                        const ipfsData = await Promise.race([fetchPromise, timeoutPromise]);
                                        if (ipfsData) {
                                            record.symptoms = Array.isArray(ipfsData.symptoms) ? ipfsData.symptoms.join(', ') : (ipfsData.symptoms || '');
                                            record.primary_diagnosis = ipfsData.primary_diagnosis || '';
                                            record.secondary_diagnoses = Array.isArray(ipfsData.secondary_diagnoses) ? ipfsData.secondary_diagnoses.join(', ') : (ipfsData.secondary_diagnoses || '');
                                            record.affected_body_parts = Array.isArray(ipfsData.affected_body_parts) ? ipfsData.affected_body_parts.join(', ') : (ipfsData.affected_body_parts || '');
                                            record.treatments = Array.isArray(ipfsData.treatments_given) ? ipfsData.treatments_given.join(', ') : 
                                                               (Array.isArray(ipfsData.treatments) ? ipfsData.treatments.join(', ') : 
                                                               (ipfsData.treatments_given || ipfsData.treatments || ''));
                                            record.medications = Array.isArray(ipfsData.medications) ? ipfsData.medications.join(', ') : (ipfsData.medications || '');
                                            record.ipfsDataFetched = true;
                                        }
                                    }
                                } catch (err) {
                                    console.error(`Failed to fetch IPFS for block ${record.block_index}:`, err.message);
                                }
                            })),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Batch timeout')), IPFS_TIMEOUT * 2))
                        ]);
                    } catch (batchErr) {
                        console.error(`Batch ${i}-${i+batchSize} IPFS fetch timed out:`, batchErr.message);
                        // Continue with next batch even if this one fails
                    }
                }
            }
            
            // Calculate fitness using personalized weights
            const fitnessScores = currentGeneration.map(record => {
                return calculateFitnessWithWeights(record, searchCriteria, weights);
            });
            
            totalEvaluated += currentGeneration.length;
            
            // Track elite records for next generation's guided sampling
            const recordsWithFitness = currentGeneration.map((record, idx) => ({
                ...record,
                fitnessScore: fitnessScores[idx].normalizedFitness,
                rawScore: fitnessScores[idx].rawScore,
                maxScore: fitnessScores[idx].maxScore,
                matchPercentage: fitnessScores[idx].percentage
            }));
            
            recordsWithFitness.sort((a, b) => b.fitnessScore - a.fitnessScore);
            
            // Update elite records for next generation
            eliteRecords = recordsWithFitness.slice(0, Math.min(20, limit * 2));
            
            if (gen % 5 === 0 || gen === generations) {
                const avgFitness = fitnessScores.reduce((sum, f) => sum + f.normalizedFitness, 0) / fitnessScores.length;
                const topFitness = recordsWithFitness[0]?.fitnessScore || 0;
                console.log(`   Gen ${gen}: Avg=${(avgFitness*100).toFixed(1)}% | Top=${(topFitness*100).toFixed(1)}%`);
            }
        }
        
        // Final recommendations from elite pool
        const recommendations = eliteRecords
            .slice(0, limit)
            .map(record => ({
                block_hash: record.block_hash,
                block_index: record.block_index,
                timestamp: record.timestamp,
                ipfs_cid: record.ipfs_cid,
                patient_id: record.patient_id,
                patient_username: record.patient_username,
                file_type: record.file_type,
                file_status: record.file_status,
                doctor_id: record.doc,
                doctor_username: record.doctor_username,
                gender: record.gender,
                blood_group: record.blood_group,
                current_conditions: record.current_conditions,
                primary_diagnosis: record.primary_diagnosis || '',
                symptoms: record.symptoms || '',
                medications: record.medications || '',
                treatments: record.treatments || '',
                fitnessScore: record.fitnessScore.toFixed(4),
                rawScore: record.rawScore.toFixed(2),
                maxScore: record.maxScore.toFixed(2),
                matchPercentage: record.matchPercentage
            }));
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`\n✅ Adaptive GA Complete:`);
        console.log(`   📊 Evaluated: ${totalEvaluated}/${totalRecords} records`);
        console.log(`   ⚡ Speed gain: ${((1 - totalEvaluated/totalRecords) * 100).toFixed(1)}% reduction`);
        console.log(`   ⏱️  Time: ${elapsedTime}s`);
        console.log(`   🎯 Found: ${recommendations.length} recommendations\n`);
        
        return {
            success: true,
            recommendations,
            algorithm: 'Adaptive Genetic Algorithm',
            totalRecordsAnalyzed: totalRecords,  // Unique records in database
            totalEvaluations: totalEvaluated,     // Total evaluations across generations
            totalRecordsAvailable: totalRecords,
            generationsRun: generations,
            isPersonalized,
            samplingEnabled: useSmartSampling,
            executionTime: elapsedTime,
            config: {
                ...GA_CONFIG,
                generations,
                populationSize: totalRecords,
                sampledRecords: totalEvaluated
            }
        };
        
    } catch (error) {
        console.error('Adaptive GA Error:', error);
        return {
            success: false,
            error: error.message,
            algorithm: 'Adaptive Genetic Algorithm'
        };
    }
}

/**
 * Calculate fitness using custom weights
 */
function calculateFitnessWithWeights(record, searchCriteria, weights) {
    let fitness = 0;
    let maxPossibleScore = 0;
    
    // Helper for text matching
    const matchTextField = (searchText, recordText, baseWeight) => {
        if (!searchText || !searchText.trim()) return { fitness: 0, maxScore: 0 };
        if (!recordText || !recordText.trim()) return { fitness: 0, maxScore: baseWeight };
        
        let localFitness = 0;
        let localMaxScore = 0;
        
        const searchNorm = normalizeString(searchText);
        const recordNorm = normalizeString(recordText);
        
        const searchTerms = searchNorm.split(/[,\s]+/).filter(t => t.length > 2);
        const recordTerms = recordNorm.split(/[,\s]+/).filter(t => t.length > 2);
        
        if (searchTerms.length === 0) return { fitness: 0, maxScore: 0 };
        if (recordTerms.length === 0) return { fitness: 0, maxScore: baseWeight };
        
        searchTerms.forEach(searchTerm => {
            let bestMatchScore = 0;
            
            for (const recordTerm of recordTerms) {
                if (recordTerm === searchTerm) {
                    bestMatchScore = 1.0;
                    break;
                } else if (recordTerm.includes(searchTerm) || searchTerm.includes(recordTerm)) {
                    bestMatchScore = Math.max(bestMatchScore, 0.8);
                }
            }
            
            if (bestMatchScore > 0) {
                localFitness += bestMatchScore * baseWeight;
            }
            localMaxScore += baseWeight;
        });
        
        return { fitness: localFitness, maxScore: localMaxScore };
    };
    
    // Apply weights to each field
    if (searchCriteria.primary_diagnosis?.trim()) {
        const result = matchTextField(searchCriteria.primary_diagnosis, record.primary_diagnosis, weights.PRIMARY_DIAGNOSIS);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.symptoms?.trim()) {
        const recordSymptoms = typeof record.symptoms === 'string' ? record.symptoms : 
                              (Array.isArray(record.symptoms) ? record.symptoms.join(', ') : '');
        const result = matchTextField(searchCriteria.symptoms, recordSymptoms, weights.SYMPTOMS);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.affected_body_parts?.trim()) {
        const recordBodyParts = typeof record.affected_body_parts === 'string' ? record.affected_body_parts :
                               (Array.isArray(record.affected_body_parts) ? record.affected_body_parts.join(', ') : '');
        const result = matchTextField(searchCriteria.affected_body_parts, recordBodyParts, weights.AFFECTED_BODY_PARTS);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.file_type?.trim()) {
        maxPossibleScore += weights.FILE_TYPE_MATCH;
        if (normalizeString(record.file_type) === normalizeString(searchCriteria.file_type)) {
            fitness += weights.FILE_TYPE_MATCH;
        }
    }
    
    if (searchCriteria.medications?.trim()) {
        const recordMedications = typeof record.medications === 'string' ? record.medications :
                                 (Array.isArray(record.medications) ? record.medications.join(', ') : '');
        const result = matchTextField(searchCriteria.medications, recordMedications, weights.MEDICATIONS);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.treatments?.trim()) {
        const recordTreatments = typeof record.treatments === 'string' ? record.treatments :
                                (Array.isArray(record.treatments) ? record.treatments.join(', ') : '');
        const result = matchTextField(searchCriteria.treatments, recordTreatments, weights.TREATMENTS);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.secondary_diagnoses?.trim()) {
        const recordSecondary = typeof record.secondary_diagnoses === 'string' ? record.secondary_diagnoses :
                               (Array.isArray(record.secondary_diagnoses) ? record.secondary_diagnoses.join(', ') : '');
        const result = matchTextField(searchCriteria.secondary_diagnoses, recordSecondary, weights.SECONDARY_DIAGNOSES);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.current_conditions?.trim()) {
        const result = matchTextField(searchCriteria.current_conditions, record.current_conditions, weights.CONDITION_SIMILARITY);
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }
    
    if (searchCriteria.doctor_id?.trim()) {
        maxPossibleScore += weights.DOCTOR_MATCH;
        if (record.doc?.toString() === searchCriteria.doctor_id.toString()) {
            fitness += weights.DOCTOR_MATCH;
        }
    }
    
    if (searchCriteria.blood_group?.trim()) {
        maxPossibleScore += weights.BLOOD_GROUP;
        if (normalizeString(record.blood_group) === normalizeString(searchCriteria.blood_group)) {
            fitness += weights.BLOOD_GROUP;
        }
    }
    
    if (searchCriteria.gender?.trim()) {
        maxPossibleScore += weights.GENDER;
        if (normalizeString(record.gender) === normalizeString(searchCriteria.gender)) {
            fitness += weights.GENDER;
        }
    }
    
    if (searchCriteria.age_range?.trim() && record.date_of_birth) {
        maxPossibleScore += weights.AGE_MATCH;
        const dob = new Date(record.date_of_birth);
        const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
        const [minAge, maxAge] = searchCriteria.age_range.split('-').map(Number);
        if (age >= minAge && age <= maxAge) {
            fitness += weights.AGE_MATCH;
        }
    }
    
    // Temporal relevance (always calculated)
    maxPossibleScore += weights.TEMPORAL_RELEVANCE;
    fitness += calculateTemporalRelevance(record.timestamp) * weights.TEMPORAL_RELEVANCE;
    
    if (maxPossibleScore === 0) return { normalizedFitness: 0, rawScore: 0, maxScore: 0, percentage: 0 };
    
    return {
        normalizedFitness: fitness / maxPossibleScore,
        rawScore: fitness,
        maxScore: maxPossibleScore,
        percentage: Math.round((fitness / maxPossibleScore) * 100)
    };
}

// Export both versions and utility functions
export { 
    evolveWeightsForUser,
    getUserFeedback,
    loadWeightProfile,
    saveWeightProfile
};
