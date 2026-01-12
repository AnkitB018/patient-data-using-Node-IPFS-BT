/**
 * Genetic Algorithm Helper
 * Multi-population bucket-based GA for medical record recommendation
 */

import { getAllBlocks } from './dbHelper.js';
import { fetchFromIPFS } from './ipfsHelper.js';
import { getAllBuckets, getRelevantBuckets } from './bucketManager.js';

/**
 * Calculate adaptive fitness score for a record based on search criteria
 */
function calculateFitness(record, ipfsData, searchCriteria) {
    let score = 0;
    let totalWeight = 0;

    // Helper to normalize text for comparison (handles strings and arrays)
    const normalize = (text) => {
        if (!text) return '';
        if (Array.isArray(text)) return text.join(', ').toLowerCase().trim();
        if (typeof text === 'string') return text.toLowerCase().trim();
        return '';
    };

    // Diagnosis matching (weight: 30)
    if (searchCriteria.diagnosis && ipfsData?.primary_diagnosis) {
        const weight = 30;
        totalWeight += weight;
        const diagnosisText = normalize(ipfsData.primary_diagnosis);
        const searchDiagnosis = normalize(searchCriteria.diagnosis);
        if (diagnosisText.includes(searchDiagnosis) || searchDiagnosis.includes(diagnosisText)) {
            score += weight;
        } else {
            // Partial match
            const words = searchDiagnosis.split(' ');
            const matches = words.filter(word => word.length > 3 && diagnosisText.includes(word));
            score += (matches.length / words.length) * weight * 0.5;
        }
    }

    // Symptoms matching (weight: 25)
    if (searchCriteria.symptoms && ipfsData?.symptoms) {
        const weight = 25;
        totalWeight += weight;
        const symptomsText = normalize(ipfsData.symptoms);
        const searchSymptoms = normalize(searchCriteria.symptoms);
        const symptomWords = searchSymptoms.split(',').map(s => s.trim()).filter(s => s.length > 2);
        const matchCount = symptomWords.filter(word => symptomsText.includes(word)).length;
        const matchScore = (matchCount / Math.max(symptomWords.length, 1)) * weight;
        score += matchScore;
    }

    // Body parts matching (weight: 15)
    if (searchCriteria.body_parts && ipfsData?.affected_body_parts) {
        const weight = 15;
        totalWeight += weight;
        const bodyPartsText = normalize(ipfsData.affected_body_parts);
        const searchParts = normalize(searchCriteria.body_parts);
        const bodyPartWords = searchParts.split(',').map(s => s.trim()).filter(s => s.length > 2);
        const matchCount = bodyPartWords.filter(word => bodyPartsText.includes(word)).length;
        const matchScore = (matchCount / Math.max(bodyPartWords.length, 1)) * weight;
        score += matchScore;
    }

    // Secondary diagnosis matching (weight: 15)
    if (searchCriteria.secondary_diagnosis && ipfsData?.secondary_diagnoses) {
        const weight = 15;
        totalWeight += weight;
        const secondaryText = normalize(ipfsData.secondary_diagnoses);
        const searchSecondary = normalize(searchCriteria.secondary_diagnosis);
        if (secondaryText.includes(searchSecondary)) {
            score += weight;
        }
    }

    // File type matching (weight: 10)
    if (searchCriteria.file_type && record.file_type) {
        const weight = 10;
        totalWeight += weight;
        if (normalize(record.file_type) === normalize(searchCriteria.file_type)) {
            score += weight;
        }
    }

    // Treatments matching (weight: 12)
    if (searchCriteria.treatments && ipfsData?.treatments_given) {
        const weight = 12;
        totalWeight += weight;
        const treatmentsText = normalize(ipfsData.treatments_given);
        const searchTreatments = normalize(searchCriteria.treatments);
        const treatmentWords = searchTreatments.split(',').map(s => s.trim()).filter(s => s.length > 2);
        const matchCount = treatmentWords.filter(word => treatmentsText.includes(word)).length;
        score += (matchCount / Math.max(treatmentWords.length, 1)) * weight;
    }

    // Medications matching (weight: 12)
    if (searchCriteria.medications && ipfsData?.medications) {
        const weight = 12;
        totalWeight += weight;
        const medicationsText = normalize(ipfsData.medications);
        const searchMedications = normalize(searchCriteria.medications);
        const medicationWords = searchMedications.split(',').map(s => s.trim()).filter(s => s.length > 2);
        const matchCount = medicationWords.filter(word => medicationsText.includes(word)).length;
        score += (matchCount / Math.max(medicationWords.length, 1)) * weight;
    }

    // Description/Conditions/Notes matching (weight: 8)
    if (searchCriteria.conditions && (ipfsData?.description || ipfsData?.followup_info)) {
        const weight = 8;
        totalWeight += weight;
        const conditionsText = normalize(ipfsData.description || '') + ' ' + normalize(ipfsData.followup_info || '');
        const searchConditions = normalize(searchCriteria.conditions);
        const conditionWords = searchConditions.split(' ').filter(s => s.length > 3);
        const matchCount = conditionWords.filter(word => conditionsText.includes(word)).length;
        score += (matchCount / Math.max(conditionWords.length, 1)) * weight;
    }

    // Gender matching (weight: 5)
    if (searchCriteria.gender && record.gender) {
        const weight = 5;
        totalWeight += weight;
        if (normalize(record.gender) === normalize(searchCriteria.gender)) {
            score += weight;
        }
    }

    // Age range matching (weight: 10)
    if (searchCriteria.age_range && record.date_of_birth) {
        const weight = 10;
        totalWeight += weight;
        try {
            const age = Math.floor((Date.now() - new Date(record.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            const [minAge, maxAge] = searchCriteria.age_range.split('-').map(Number);
            if (age >= minAge && age <= maxAge) {
                score += weight;
            }
        } catch (e) {
            // Invalid date
        }
    }

    // Return percentage (0-100)
    return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
}

/**
 * Calculate fitness-weighted neighborhood (top buckets) for a population
 */
function calculateNeighborhood(population, fitnessMap, allBuckets) {
    const bucketScores = {};
    
    // For each record in population, add its fitness to buckets it belongs to
    for (const blockIndex of population) {
        const fitness = fitnessMap.get(blockIndex) || 0;
        
        // Check each bucket category
        for (const [categoryName, categoryBuckets] of Object.entries(allBuckets)) {
            if (categoryName === 'leftover') continue;
            
            for (const [bucketName, records] of Object.entries(categoryBuckets)) {
                if (records.has(blockIndex)) {
                    const bucketKey = `${categoryName}:${bucketName}`;
                    bucketScores[bucketKey] = (bucketScores[bucketKey] || 0) + fitness;
                }
            }
        }
    }
    
    // Sort buckets by score and return top 5-10
    const sortedBuckets = Object.entries(bucketScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([bucket]) => bucket);
    
    return sortedBuckets;
}

/**
 * Sample records from neighborhood buckets
 */
function sampleFromNeighborhood(neighborhood, allBuckets, count, exploredSet) {
    const samples = [];
    const availableRecords = new Set();
    
    // Collect all records from neighborhood buckets
    for (const bucketKey of neighborhood) {
        const [category, bucketName] = bucketKey.split(':');
        if (allBuckets[category] && allBuckets[category][bucketName]) {
            for (const blockIndex of allBuckets[category][bucketName]) {
                if (!exploredSet.has(blockIndex)) {
                    availableRecords.add(blockIndex);
                }
            }
        }
    }
    
    // Random sample
    const recordsArray = Array.from(availableRecords);
    while (samples.length < count && recordsArray.length > 0) {
        const randomIndex = Math.floor(Math.random() * recordsArray.length);
        samples.push(recordsArray[randomIndex]);
        recordsArray.splice(randomIndex, 1);
    }
    
    return samples;
}

/**
 * Sample random records from all blocks
 */
function sampleRandomRecords(allBlocks, count, exploredSet) {
    const samples = [];
    const availableBlocks = allBlocks.filter(b => !exploredSet.has(b.block_index) && b.block_index !== 0);
    
    while (samples.length < count && availableBlocks.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableBlocks.length);
        samples.push(availableBlocks[randomIndex].block_index);
        availableBlocks.splice(randomIndex, 1);
    }
    
    return samples;
}

/**
 * Multi-population Genetic Algorithm with bucket-based neighborhood search
 */
export async function multiPopulationGA(searchCriteria, topN = 10) {
    console.log('\n🧬 Starting Multi-Population Genetic Algorithm');
    console.log('Search Criteria:', searchCriteria);
    
    const startTime = Date.now();
    
    // Data structures
    const fitnessMap = new Map(); // blockIndex -> fitness
    const exploredSet = new Set(); // Set of evaluated blockIndex
    const ipfsCache = new Map(); // blockIndex -> ipfsData
    
    // Get all data
    const allBlocks = await getAllBlocks();
    const allBuckets = getAllBuckets();
    const totalRecords = allBlocks.filter(b => b.block_index !== 0).length;
    
    console.log(`📊 Total records available: ${totalRecords}`);
    
    // Get relevant buckets from search criteria
    const relevantBuckets = getRelevantBuckets(searchCriteria);
    console.log(`🎯 Relevant buckets: ${relevantBuckets.length > 0 ? relevantBuckets.join(', ') : 'None'}`);
    
    // Initialize 5 populations
    const NUM_POPULATIONS = 5;
    const INITIAL_POP_SIZE = 100;
    const populations = Array(NUM_POPULATIONS).fill(null).map(() => []);
    const neighborhoods = Array(NUM_POPULATIONS).fill(null).map(() => []);
    
    // ========================================
    // GENERATION 1: Initialize populations
    // ========================================
    console.log('\n📍 GEN 1: Initializing populations');
    
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        const population = populations[popIndex];
        
        // Sample 40% from relevant buckets if available
        if (relevantBuckets.length > 0) {
            const priorityCount = Math.floor(INITIAL_POP_SIZE * 0.4);
            const prioritySamples = sampleFromNeighborhood(relevantBuckets, allBuckets, priorityCount, exploredSet);
            population.push(...prioritySamples);
            prioritySamples.forEach(idx => exploredSet.add(idx)); // Add to Set immediately to prevent duplicates
        }
        
        // Fill rest randomly
        const remainingCount = INITIAL_POP_SIZE - population.length;
        const randomSamples = sampleRandomRecords(allBlocks, remainingCount, exploredSet);
        population.push(...randomSamples);
        randomSamples.forEach(idx => exploredSet.add(idx)); // Add to Set immediately to prevent duplicates
        
        console.log(`  Population ${popIndex + 1}: ${population.length} records (all unique)`);
    }
    
    // VERIFICATION: Ensure no duplicates across populations
    const allPopulationRecords = populations.flat();
    const uniqueCount = new Set(allPopulationRecords).size;
    if (uniqueCount !== allPopulationRecords.length) {
        console.warn(`⚠️  WARNING: Duplicate detected! Total: ${allPopulationRecords.length}, Unique: ${uniqueCount}`);
    }
    console.log(`✓ Total unique records in populations: ${uniqueCount}`);
    console.log(`✓ Total records in exploredSet: ${exploredSet.size}/${totalRecords}`);
    
    // Evaluate fitness for all records in Gen 1
    console.log('  Evaluating fitness...');
    let evaluationCount = 0;
    for (const population of populations) {
        for (const blockIndex of population) {
            if (!fitnessMap.has(blockIndex)) {
                evaluationCount++;
                const block = allBlocks.find(b => b.block_index === blockIndex);
                let ipfsData = null;
                
                if (block?.ipfs_cid) {
                    try {
                        ipfsData = await fetchFromIPFS(block.ipfs_cid, true);
                        ipfsCache.set(blockIndex, ipfsData);
                    } catch (error) {
                        // Silent fail
                    }
                }
                
                const fitness = calculateFitness(block, ipfsData, searchCriteria);
                fitnessMap.set(blockIndex, fitness); // Map ensures each record evaluated only once
            } else {
                // This should never happen in Gen 1, but log if it does
                console.warn(`⚠️  Block #${blockIndex} already evaluated (fitness: ${fitnessMap.get(blockIndex).toFixed(2)}%)`);
            }
        }
    }
    console.log(`✓ Evaluated ${evaluationCount} unique records (total in Map: ${fitnessMap.size})`);
    
    // Remove bottom 50 from each population
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        populations[popIndex].sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
        populations[popIndex] = populations[popIndex].slice(0, 50);
    }
    
    // Calculate neighborhoods
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        neighborhoods[popIndex] = calculateNeighborhood(populations[popIndex], fitnessMap, allBuckets);
        console.log(`  Population ${popIndex + 1} neighborhood: ${neighborhoods[popIndex].length} buckets`);
    }
    
    // Check for 85% fitness
    let bestFitness = Math.max(...Array.from(fitnessMap.values()));
    console.log(`  Best fitness: ${bestFitness.toFixed(2)}%`);
    
    // ========================================
    // GENERATIONS 2+
    // ========================================
    let generation = 2;
    let foundHighFitness = false;
    let highFitnessRecord = null;
    
    while (generation <= 50 && exploredSet.size < totalRecords && !foundHighFitness) {
        console.log(`\n📍 GEN ${generation}:`);
        
        const genStartSize = exploredSet.size;
        let genEvaluations = 0;
        
        // Add 50 new records to each population
        for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
            const population = populations[popIndex];
            const neighborhood = neighborhoods[popIndex];
            
            // 30 from neighborhood, 20 random
            const neighborhoodSamples = sampleFromNeighborhood(neighborhood, allBuckets, 30, exploredSet);
            const randomSamples = sampleRandomRecords(allBlocks, 20, exploredSet);
            
            const newRecords = [...neighborhoodSamples, ...randomSamples];
            
            // CRITICAL: Mark as explored BEFORE adding to population to prevent cross-population duplicates
            newRecords.forEach(idx => {
                if (exploredSet.has(idx)) {
                    console.warn(`⚠️  WARNING: Block #${idx} already in exploredSet!`);
                }
                exploredSet.add(idx);
            });
            population.push(...newRecords);
            
            // Evaluate fitness for new records ONLY
            for (const blockIndex of newRecords) {
                if (!fitnessMap.has(blockIndex)) {
                    genEvaluations++;
                    const block = allBlocks.find(b => b.block_index === blockIndex);
                    let ipfsData = ipfsCache.get(blockIndex);
                    
                    if (!ipfsData && block?.ipfs_cid) {
                        try {
                            ipfsData = await fetchFromIPFS(block.ipfs_cid, true);
                            ipfsCache.set(blockIndex, ipfsData);
                        } catch (error) {
                            // Silent fail
                        }
                    }
                    
                    const fitness = calculateFitness(block, ipfsData, searchCriteria);
                    fitnessMap.set(blockIndex, fitness); // Map ensures no re-evaluation
                    
                    // Check for 85%+ fitness
                    if (fitness >= 85 && !foundHighFitness) {
                        foundHighFitness = true;
                        highFitnessRecord = blockIndex;
                        console.log(`  🎯 Found ${fitness.toFixed(2)}% fitness record (Block #${blockIndex})`);
                    }
                } else {
                    // Should never happen - log if it does
                    console.warn(`⚠️  Block #${blockIndex} already evaluated! Fitness: ${fitnessMap.get(blockIndex).toFixed(2)}%`);
                }
            }
            
            // Sort and keep top 50
            population.sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
            populations[popIndex] = population.slice(0, 50);
        }
        
        const genNewRecords = exploredSet.size - genStartSize;
        console.log(`  New unique records this gen: ${genNewRecords}`);
        console.log(`  Fitness evaluations this gen: ${genEvaluations}`);
        console.log(`  Total explored: ${exploredSet.size}/${totalRecords} (${((exploredSet.size/totalRecords)*100).toFixed(1)}%)`);
        console.log(`  Total in fitnessMap: ${fitnessMap.size}`);
        bestFitness = Math.max(...Array.from(fitnessMap.values()));
        console.log(`  Best fitness: ${bestFitness.toFixed(2)}%`);
        
        // Crossover every 2 generations
        if (generation % 2 === 0) {
            console.log('  🔄 Performing crossover...');
            
            // Store records to exchange
            const toExchange = [];
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                const currentPop = populations[popIndex];
                // Get ranks #2, #4, #6, #8, #10 (indices 1, 3, 5, 7, 9)
                const exchangeIndices = [1, 3, 5, 7, 9];
                const records = exchangeIndices.map(i => currentPop[i]).filter(x => x !== undefined);
                toExchange.push(records);
            }
            
            // Exchange circularly: pop1→pop2, pop2→pop3, pop3→pop4, pop4→pop5, pop5→pop1
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                const currentPop = populations[popIndex];
                const nextPopIndex = (popIndex + 1) % NUM_POPULATIONS;
                const receivedRecords = toExchange[popIndex];
                
                // Remove the exchanged records from current population
                const exchangeIndices = [1, 3, 5, 7, 9];
                const remaining = currentPop.filter((_, i) => !exchangeIndices.includes(i));
                
                // Add received records and sort
                remaining.push(...receivedRecords);
                remaining.sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
                populations[popIndex] = remaining.slice(0, 50);
            }
            
            // Recalculate neighborhoods after crossover
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                neighborhoods[popIndex] = calculateNeighborhood(populations[popIndex], fitnessMap, allBuckets);
            }
        }
        
        generation++;
        
        // Stop if found high fitness
        if (foundHighFitness) {
            console.log('  ✓ High fitness record found, will run refinement generation');
            break;
        }
    }
    
    // ========================================
    // REFINEMENT GENERATION (if 85%+ found)
    // ========================================
    if (foundHighFitness && highFitnessRecord) {
        console.log(`\n📍 REFINEMENT GEN: Searching neighborhood of Block #${highFitnessRecord}`);
        
        // Find which buckets this record belongs to
        const refinementBuckets = [];
        for (const [categoryName, categoryBuckets] of Object.entries(allBuckets)) {
            if (categoryName === 'leftover') continue;
            for (const [bucketName, records] of Object.entries(categoryBuckets)) {
                if (records.has(highFitnessRecord)) {
                    refinementBuckets.push(`${categoryName}:${bucketName}`);
                }
            }
        }
        
        console.log(`  Refinement buckets: ${refinementBuckets.length} found`);
        
        const beforeRefinement = exploredSet.size;
        
        // Sample heavily from these buckets (only unexplored records)
        const refinementSamples = sampleFromNeighborhood(refinementBuckets, allBuckets, 100, exploredSet);
        refinementSamples.forEach(idx => {
            if (exploredSet.has(idx)) {
                console.warn(`⚠️  Refinement: Block #${idx} already explored!`);
            }
            exploredSet.add(idx);
        });
        
        console.log(`  Sampled ${refinementSamples.length} new unique records for refinement`);
        
        // Evaluate these records
        let refinementEvals = 0;
        for (const blockIndex of refinementSamples) {
            if (!fitnessMap.has(blockIndex)) {
                refinementEvals++;
                const block = allBlocks.find(b => b.block_index === blockIndex);
                let ipfsData = ipfsCache.get(blockIndex);
                
                if (!ipfsData && block?.ipfs_cid) {
                    try {
                        ipfsData = await fetchFromIPFS(block.ipfs_cid, true);
                        ipfsCache.set(blockIndex, ipfsData);
                    } catch (error) {
                        // Silent fail
                    }
                }
                
                const fitness = calculateFitness(block, ipfsData, searchCriteria);
                fitnessMap.set(blockIndex, fitness);
            } else {
                console.warn(`⚠️  Refinement: Block #${blockIndex} already evaluated!`);
            }
        }
        
        console.log(`  Refinement evaluated ${refinementEvals} new records (${refinementSamples.length - refinementEvals} already in cache)`);
        generation++; // Count refinement as a generation
    }
    
    // ========================================
    // COLLECT TOP N RESULTS
    // ========================================
    console.log('\n📊 Collecting results...');
    
    // Get all evaluated records sorted by fitness
    const allEvaluated = Array.from(fitnessMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
    
    console.log('📋 Top evaluated records from fitnessMap:');
    allEvaluated.slice(0, 3).forEach(([idx, fit]) => {
        console.log(`   Block #${idx}: ${fit.toFixed(2)}%`);
    });
    
    const results = [];
    for (const [blockIndex, fitness] of allEvaluated) {
        const block = allBlocks.find(b => b.block_index === blockIndex);
        const ipfsData = ipfsCache.get(blockIndex);
        
        results.push({
            block_index: blockIndex,
            fitness: fitness,
            patient_id: block.patient_id,
            file_type: block.file_type,
            doctor: block.doc,
            timestamp: block.timestamp,
            ipfs_cid: block.ipfs_cid,
            diagnosis: ipfsData?.primary_diagnosis || 'N/A',
            symptoms: ipfsData?.symptoms || 'N/A',
            body_parts: ipfsData?.affected_body_parts || 'N/A'
        });
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Algorithm Complete!`);
    console.log(`   Generations: ${generation - 1}`);
    console.log(`   Records Evaluated: ${exploredSet.size}/${totalRecords}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Top Fitness: ${results[0]?.fitness.toFixed(2)}%`);
    
    console.log('\n📤 First 3 results being returned:');
    results.slice(0, 3).forEach(r => {
        console.log(`   Block #${r.block_index}: fitness=${r.fitness}, patient=${r.patient_id}`);
    });
    
    return {
        success: true,
        results,
        metrics: {
            generations: generation - 1,
            recordsEvaluated: exploredSet.size,
            totalRecords: totalRecords,
            evaluationPercentage: ((exploredSet.size / totalRecords) * 100).toFixed(2),
            duration: `${duration}s`,
            topFitness: results[0]?.fitness.toFixed(2) || 0
        }
    };
}
