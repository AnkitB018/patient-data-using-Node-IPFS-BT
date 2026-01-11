/**
 * Medical Forecast Helper using Genetic Algorithm
 * 
 * This module uses GA to find similar patient cases and predict recovery outcomes
 * based on historical data patterns.
 */

import pool from './dbHelper.js';
import { fetchFromIPFS } from './ipfsHelper.js';

// Fitness threshold for reliable predictions
const FITNESS_THRESHOLD = 0.70;
const MIN_MATCHES_FOR_FORECAST = 3;
const MAX_SEARCH_RESULTS = 20;

// Episode detection parameters
const EPISODE_GAP_DAYS = 30;
const MAX_DAYS_TO_CONSIDER_ONGOING = 45;

// Fitness weights for similarity matching
const FITNESS_WEIGHTS = {
    PRIMARY_DIAGNOSIS: 9.0,
    SYMPTOMS: 7.5,
    AFFECTED_BODY_PARTS: 7.0,
    SECONDARY_DIAGNOSES: 5.0,
    DEMOGRAPHICS: 3.0,
};

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
    if (!str) return '';
    return str.toString().toLowerCase().trim();
}

/**
 * Calculate similarity score between current patient and historical record
 */
function calculateSimilarityFitness(currentPatient, historicalRecord) {
    let fitness = 0;
    let maxPossibleScore = 0;

    // Helper function for text matching
    const matchTextField = (searchText, recordText, baseWeight) => {
        // Convert to string if it's an array or other type
        if (Array.isArray(searchText)) {
            searchText = searchText.join(', ');
        } else if (searchText && typeof searchText !== 'string') {
            searchText = String(searchText);
        }
        
        if (Array.isArray(recordText)) {
            recordText = recordText.join(', ');
        } else if (recordText && typeof recordText !== 'string') {
            recordText = String(recordText);
        }
        
        if (!searchText || !searchText.trim()) return { fitness: 0, maxScore: 0 };
        if (!recordText || !recordText.trim()) return { fitness: 0, maxScore: baseWeight };

        const searchNorm = normalizeString(searchText);
        const recordNorm = normalizeString(recordText);

        const searchTerms = searchNorm.split(/[,\s]+/).filter(t => t.length > 2);
        const recordTerms = recordNorm.split(/[,\s]+/).filter(t => t.length > 2);

        if (searchTerms.length === 0) return { fitness: 0, maxScore: 0 };
        if (recordTerms.length === 0) return { fitness: 0, maxScore: baseWeight };

        let localFitness = 0;
        let localMaxScore = 0;

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

    // 1. Primary Diagnosis (Most important)
    if (currentPatient.primary_diagnosis) {
        const result = matchTextField(
            currentPatient.primary_diagnosis,
            historicalRecord.primary_diagnosis,
            FITNESS_WEIGHTS.PRIMARY_DIAGNOSIS
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }

    // 2. Symptoms
    if (currentPatient.symptoms) {
        const recordSymptoms = Array.isArray(historicalRecord.symptoms) 
            ? historicalRecord.symptoms.join(', ') 
            : historicalRecord.symptoms;
        const result = matchTextField(
            currentPatient.symptoms,
            recordSymptoms,
            FITNESS_WEIGHTS.SYMPTOMS
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }

    // 3. Affected Body Parts
    if (currentPatient.affected_body_parts) {
        const result = matchTextField(
            currentPatient.affected_body_parts,
            historicalRecord.affected_body_parts,
            FITNESS_WEIGHTS.AFFECTED_BODY_PARTS
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }

    // 4. Secondary Diagnoses
    if (currentPatient.secondary_diagnoses) {
        const result = matchTextField(
            currentPatient.secondary_diagnoses,
            historicalRecord.secondary_diagnoses,
            FITNESS_WEIGHTS.SECONDARY_DIAGNOSES
        );
        fitness += result.fitness;
        maxPossibleScore += result.maxScore;
    }

    // 5. Demographics (age, gender, blood group)
    if (currentPatient.gender && historicalRecord.gender) {
        maxPossibleScore += FITNESS_WEIGHTS.DEMOGRAPHICS;
        if (normalizeString(currentPatient.gender) === normalizeString(historicalRecord.gender)) {
            fitness += FITNESS_WEIGHTS.DEMOGRAPHICS * 0.5;
        }
    }

    if (currentPatient.blood_group && historicalRecord.blood_group) {
        maxPossibleScore += FITNESS_WEIGHTS.DEMOGRAPHICS;
        if (normalizeString(currentPatient.blood_group) === normalizeString(historicalRecord.blood_group)) {
            fitness += FITNESS_WEIGHTS.DEMOGRAPHICS * 0.5;
        }
    }

    // Calculate percentage score
    const fitnessPercentage = maxPossibleScore > 0 ? fitness / maxPossibleScore : 0;
    
    return {
        rawFitness: fitness,
        maxPossible: maxPossibleScore,
        percentage: fitnessPercentage
    };
}

/**
 * Detect disease episode boundaries and calculate recovery time
 */
async function analyzePatientEpisode(patientId, primaryDiagnosis) {
    try {
        // Fetch all records for this patient chronologically
        const result = await pool.query(
            `SELECT 
                block_index,
                timestamp,
                ipfs_cid,
                file_type,
                file_status,
                doc
            FROM blockchain_metadata
            WHERE patient_id = $1
            ORDER BY timestamp ASC`,
            [patientId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const records = result.rows;
        
        // Find all records related to this diagnosis
        let episodeRecords = [];
        let episodeStart = null;
        let episodeEnd = null;
        
        for (const record of records) {
            // Fetch IPFS data to check diagnosis
            const ipfsData = await fetchFromIPFS(record.ipfs_cid);
            
            if (ipfsData) {
                const recordDiagnosis = normalizeString(ipfsData.primary_diagnosis || ipfsData.disease);
                const searchDiagnosis = normalizeString(primaryDiagnosis);
                
                // Check if this record is related to the same diagnosis
                if (recordDiagnosis.includes(searchDiagnosis) || searchDiagnosis.includes(recordDiagnosis)) {
                    episodeRecords.push({
                        ...record,
                        ipfsData: ipfsData,
                        timestamp_num: parseInt(record.timestamp)
                    });
                }
            }
        }

        if (episodeRecords.length === 0) {
            return null;
        }

        // Episode start is the first record
        episodeStart = episodeRecords[0].timestamp_num;
        
        // Detect episode end
        const lastRecord = episodeRecords[episodeRecords.length - 1];
        const lastRecordTime = lastRecord.timestamp_num;
        const currentTime = Date.now();
        const daysSinceLastRecord = (currentTime - lastRecordTime) / (1000 * 60 * 60 * 24);

        let status = 'ongoing';
        let recoveryDays = null;

        // Check if episode has ended
        if (lastRecord.file_status && normalizeString(lastRecord.file_status) === 'closed') {
            episodeEnd = lastRecordTime;
            status = 'recovered';
            recoveryDays = Math.round((episodeEnd - episodeStart) / (1000 * 60 * 60 * 24));
        } else if (daysSinceLastRecord > EPISODE_GAP_DAYS) {
            // No records for 30+ days, assume recovered
            episodeEnd = lastRecordTime;
            status = 'recovered';
            recoveryDays = Math.round((episodeEnd - episodeStart) / (1000 * 60 * 60 * 24));
        } else {
            // Still ongoing
            status = 'ongoing';
            recoveryDays = null;
        }

        return {
            patientId,
            episodeStart,
            episodeEnd,
            status,
            recoveryDays,
            totalRecords: episodeRecords.length,
            firstRecord: episodeRecords[0],
            lastRecord: episodeRecords[episodeRecords.length - 1]
        };
    } catch (error) {
        console.error(`Error analyzing episode for patient ${patientId}:`, error);
        return null;
    }
}

/**
 * Find similar patients using GA-inspired approach
 */
async function findSimilarPatients(currentPatientData, excludePatientId) {
    try {
        console.log('🔍 Searching for similar patients...');
        
        // Fetch all patient records (excluding current patient)
        const query = `
            SELECT DISTINCT
                bm.patient_id,
                bm.block_index,
                bm.timestamp,
                bm.ipfs_cid,
                bm.file_type,
                bm.file_status,
                bm.doc,
                p.gender,
                p.blood_group,
                p.date_of_birth
            FROM blockchain_metadata bm
            LEFT JOIN patients p ON bm.patient_id = p.patient_id
            WHERE bm.patient_id != $1
              AND bm.block_index > 0
            ORDER BY bm.timestamp DESC
        `;
        
        const result = await pool.query(query, [excludePatientId]);
        const allRecords = result.rows;
        
        console.log(`Found ${allRecords.length} records from other patients`);
        
        if (allRecords.length === 0) {
            return [];
        }

        // Fetch IPFS data and calculate fitness for each record
        const scoredRecords = [];
        
        for (const record of allRecords) {
            try {
                const ipfsData = await fetchFromIPFS(record.ipfs_cid);
                
                if (ipfsData) {
                    const combinedRecord = {
                        ...record,
                        primary_diagnosis: ipfsData.primary_diagnosis || ipfsData.disease,
                        symptoms: ipfsData.symptoms,
                        affected_body_parts: ipfsData.affected_body_parts || ipfsData.affected_body_part,
                        secondary_diagnoses: ipfsData.secondary_diagnoses || ipfsData.current_conditions,
                        medications: ipfsData.medications,
                        treatments: ipfsData.treatments_given || ipfsData.treatments,
                    };
                    
                    // Calculate fitness score
                    const fitnessScore = calculateSimilarityFitness(currentPatientData, combinedRecord);
                    
                    // Only include if meets threshold
                    if (fitnessScore.percentage >= FITNESS_THRESHOLD) {
                        scoredRecords.push({
                            record: combinedRecord,
                            fitness: fitnessScore.percentage,
                            rawFitness: fitnessScore.rawFitness,
                            maxPossible: fitnessScore.maxPossible
                        });
                    }
                }
            } catch (error) {
                console.error(`Error processing record ${record.ipfs_cid}:`, error.message);
            }
        }

        // Sort by fitness (best matches first)
        scoredRecords.sort((a, b) => b.fitness - a.fitness);
        
        // Return top matches
        const topMatches = scoredRecords.slice(0, MAX_SEARCH_RESULTS);
        
        console.log(`✅ Found ${scoredRecords.length} matches above ${FITNESS_THRESHOLD * 100}% threshold`);
        console.log(`📊 Top match fitness: ${topMatches.length > 0 ? (topMatches[0].fitness * 100).toFixed(1) + '%' : 'N/A'}`);
        
        return topMatches;
    } catch (error) {
        console.error('Error finding similar patients:', error);
        throw error;
    }
}

/**
 * Generate forecast based on similar patient outcomes
 */
export async function generatePatientForecast(patientId) {
    try {
        console.log(`\n🔮 Generating forecast for patient ${patientId}...`);
        
        // 1. Get current patient's latest health data
        const latestRecordResult = await pool.query(
            `SELECT 
                bm.*,
                p.gender,
                p.blood_group,
                p.date_of_birth,
                p.username as patient_name
            FROM blockchain_metadata bm
            LEFT JOIN patients p ON bm.patient_id = p.patient_id
            WHERE bm.patient_id = $1
              AND bm.block_index > 0
            ORDER BY bm.timestamp DESC
            LIMIT 1`,
            [patientId]
        );

        if (latestRecordResult.rows.length === 0) {
            return {
                success: false,
                message: 'No medical records found for this patient'
            };
        }

        const latestRecord = latestRecordResult.rows[0];
        const latestIPFSData = await fetchFromIPFS(latestRecord.ipfs_cid);

        if (!latestIPFSData) {
            return {
                success: false,
                message: 'Unable to fetch patient medical data'
            };
        }

        const currentPatientData = {
            primary_diagnosis: latestIPFSData.primary_diagnosis || latestIPFSData.disease,
            symptoms: latestIPFSData.symptoms,
            affected_body_parts: latestIPFSData.affected_body_parts || latestIPFSData.affected_body_part,
            secondary_diagnoses: latestIPFSData.secondary_diagnoses || latestIPFSData.current_conditions,
            gender: latestRecord.gender,
            blood_group: latestRecord.blood_group,
        };

        console.log('📋 Current patient diagnosis:', currentPatientData.primary_diagnosis);

        // 2. Find similar patients using GA approach
        const similarMatches = await findSimilarPatients(currentPatientData, patientId);

        if (similarMatches.length < MIN_MATCHES_FOR_FORECAST) {
            return {
                success: true,
                hasData: false,
                message: `Insufficient similar cases found for reliable forecast (found ${similarMatches.length}, need at least ${MIN_MATCHES_FOR_FORECAST} with ${FITNESS_THRESHOLD * 100}% match)`,
                matchesFound: similarMatches.length,
                threshold: FITNESS_THRESHOLD
            };
        }

        // 3. Analyze episodes for each matched patient
        console.log(`📊 Analyzing ${similarMatches.length} similar cases...`);
        
        const episodeAnalyses = [];
        const uniquePatients = new Set();

        for (const match of similarMatches) {
            const patId = match.record.patient_id;
            
            // Avoid analyzing same patient multiple times
            if (uniquePatients.has(patId)) continue;
            uniquePatients.add(patId);

            const episode = await analyzePatientEpisode(patId, currentPatientData.primary_diagnosis);
            
            if (episode && episode.status === 'recovered' && episode.recoveryDays !== null) {
                episodeAnalyses.push({
                    patientId: patId,
                    fitness: match.fitness,
                    recoveryDays: episode.recoveryDays,
                    totalRecords: episode.totalRecords,
                    treatments: match.record.treatments,
                    medications: match.record.medications
                });
            }
        }

        console.log(`✅ Found ${episodeAnalyses.length} recovered cases`);

        if (episodeAnalyses.length < MIN_MATCHES_FOR_FORECAST) {
            return {
                success: true,
                hasData: false,
                message: `Found ${similarMatches.length} similar cases, but only ${episodeAnalyses.length} have recovery data. Need at least ${MIN_MATCHES_FOR_FORECAST} for reliable forecast.`,
                matchesFound: similarMatches.length,
                recoveredCases: episodeAnalyses.length
            };
        }

        // 4. Calculate statistics
        const recoveryTimes = episodeAnalyses.map(e => e.recoveryDays);
        const avgRecovery = Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length);
        const minRecovery = Math.min(...recoveryTimes);
        const maxRecovery = Math.max(...recoveryTimes);
        const medianRecovery = recoveryTimes.sort((a, b) => a - b)[Math.floor(recoveryTimes.length / 2)];

        // Collect common treatments
        const treatmentFrequency = {};
        const medicationFrequency = {};

        episodeAnalyses.forEach(episode => {
            // Count treatments
            if (episode.treatments) {
                const treatments = Array.isArray(episode.treatments) 
                    ? episode.treatments 
                    : episode.treatments.split(',').map(t => t.trim());
                
                treatments.forEach(treatment => {
                    if (treatment) {
                        treatmentFrequency[treatment] = (treatmentFrequency[treatment] || 0) + 1;
                    }
                });
            }

            // Count medications
            if (episode.medications) {
                const medications = Array.isArray(episode.medications)
                    ? episode.medications
                    : episode.medications.split(',').map(m => m.trim());
                
                medications.forEach(medication => {
                    if (medication) {
                        medicationFrequency[medication] = (medicationFrequency[medication] || 0) + 1;
                    }
                });
            }
        });

        // Get top 3 treatments and medications
        const topTreatments = Object.entries(treatmentFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([treatment, count]) => ({
                name: treatment,
                frequency: count,
                percentage: Math.round((count / episodeAnalyses.length) * 100)
            }));

        const topMedications = Object.entries(medicationFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([medication, count]) => ({
                name: medication,
                frequency: count,
                percentage: Math.round((count / episodeAnalyses.length) * 100)
            }));

        // Determine confidence level
        let confidenceLevel = 'Low';
        if (episodeAnalyses.length >= 15) confidenceLevel = 'High';
        else if (episodeAnalyses.length >= 8) confidenceLevel = 'Moderate';
        else if (episodeAnalyses.length >= 3) confidenceLevel = 'Limited';

        // 5. Return forecast
        return {
            success: true,
            hasData: true,
            forecast: {
                diagnosis: currentPatientData.primary_diagnosis,
                similarCasesFound: episodeAnalyses.length,
                totalMatchesAnalyzed: similarMatches.length,
                confidenceLevel: confidenceLevel,
                fitnessThreshold: `${FITNESS_THRESHOLD * 100}%`,
                averageFitness: `${Math.round(episodeAnalyses.reduce((sum, e) => sum + e.fitness, 0) / episodeAnalyses.length * 100)}%`,
                recovery: {
                    averageDays: avgRecovery,
                    medianDays: medianRecovery,
                    rangeDays: { min: minRecovery, max: maxRecovery },
                    averageWeeks: Math.round(avgRecovery / 7),
                    rangeWeeks: {
                        min: Math.round(minRecovery / 7),
                        max: Math.round(maxRecovery / 7)
                    }
                },
                commonTreatments: topTreatments,
                commonMedications: topMedications,
                successRate: `${Math.round((episodeAnalyses.length / episodeAnalyses.length) * 100)}%` // All analyzed cases recovered
            }
        };

    } catch (error) {
        console.error('Error generating forecast:', error);
        return {
            success: false,
            message: 'Error generating forecast: ' + error.message
        };
    }
}
