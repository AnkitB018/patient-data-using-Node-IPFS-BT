/**
 * Genetic Algorithm Helper
 * Multi-population bucket-based GA for medical record recommendation
 */

import { getAllBlocks } from './dbHelper.js';
import { fetchFromIPFS } from './ipfsHelper.js';
import { getAllBuckets, getRelevantBuckets } from './bucketManager.js';import {
    initializeVisualization,
    captureInitialSampling,
    captureFitnessEvaluation,
    captureGenerationSnapshot,
    captureCrossover,
    captureRefinementGeneration,
    saveVisualizationData
} from './gaVisualizationHelper.js';
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

    // Diagnosis matching (weight: 28)
    if (searchCriteria.diagnosis && ipfsData?.primary_diagnosis) {
        const weight = 28;
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

    // Symptoms matching (weight: 18)
    if (searchCriteria.symptoms && ipfsData?.symptoms) {
        const weight = 18;
        totalWeight += weight;
        
        // Normalize and split both search and record symptoms
        const symptomsText = normalize(ipfsData.symptoms);
        const recordSymptoms = symptomsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const searchSymptoms = normalize(searchCriteria.symptoms).split(',').map(s => s.trim()).filter(s => s.length > 2);
        
        // Count how many search symptoms are found in record symptoms
        let matchCount = 0;
        for (const searchSymptom of searchSymptoms) {
            // Check if any record symptom contains this search symptom
            if (recordSymptoms.some(recordSymptom => recordSymptom.includes(searchSymptom) || searchSymptom.includes(recordSymptom))) {
                matchCount++;
            }
        }
        
        // Score based on percentage of search symptoms found
        const matchScore = (matchCount / Math.max(searchSymptoms.length, 1)) * weight;
        score += matchScore;
    }

    // Body parts matching (weight: 12)
    if (searchCriteria.body_parts && ipfsData?.affected_body_parts) {
        const weight = 12;
        totalWeight += weight;
        
        // Normalize and split both search and record body parts
        const bodyPartsText = normalize(ipfsData.affected_body_parts);
        const recordParts = bodyPartsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const searchParts = normalize(searchCriteria.body_parts).split(',').map(s => s.trim()).filter(s => s.length > 2);
        
        // Count how many search parts are found in record parts
        let matchCount = 0;
        for (const searchPart of searchParts) {
            if (recordParts.some(recordPart => recordPart.includes(searchPart) || searchPart.includes(recordPart))) {
                matchCount++;
            }
        }
        
        const matchScore = (matchCount / Math.max(searchParts.length, 1)) * weight;
        score += matchScore;
    }

    // Secondary diagnosis matching (weight: 10)
    if (searchCriteria.secondary_diagnosis && ipfsData?.secondary_diagnoses) {
        const weight = 10;
        totalWeight += weight;
        const secondaryText = normalize(ipfsData.secondary_diagnoses);
        const searchSecondary = normalize(searchCriteria.secondary_diagnosis);
        if (secondaryText.includes(searchSecondary)) {
            score += weight;
        }
    }

    // File type matching (weight: 6)
    if (searchCriteria.file_type && record.file_type) {
        const weight = 6;
        totalWeight += weight;
        if (normalize(record.file_type) === normalize(searchCriteria.file_type)) {
            score += weight;
        }
    }

    // Treatments matching (weight: 10)
    if (searchCriteria.treatments && ipfsData?.treatments_given) {
        const weight = 10;
        totalWeight += weight;
        
        const treatmentsText = normalize(ipfsData.treatments_given);
        const recordTreatments = treatmentsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const searchTreatments = normalize(searchCriteria.treatments).split(',').map(s => s.trim()).filter(s => s.length > 2);
        
        let matchCount = 0;
        for (const searchTreatment of searchTreatments) {
            if (recordTreatments.some(recordTreatment => recordTreatment.includes(searchTreatment) || searchTreatment.includes(recordTreatment))) {
                matchCount++;
            }
        }
        
        score += (matchCount / Math.max(searchTreatments.length, 1)) * weight;
    }

    // Medications matching (weight: 10)
    if (searchCriteria.medications && ipfsData?.medications) {
        const weight = 10;
        totalWeight += weight;
        
        const medicationsText = normalize(ipfsData.medications);
        const recordMedications = medicationsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const searchMedications = normalize(searchCriteria.medications).split(',').map(s => s.trim()).filter(s => s.length > 2);
        
        let matchCount = 0;
        for (const searchMedication of searchMedications) {
            if (recordMedications.some(recordMedication => recordMedication.includes(searchMedication) || searchMedication.includes(recordMedication))) {
                matchCount++;
            }
        }
        
        score += (matchCount / Math.max(searchMedications.length, 1)) * weight;
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

    // Gender matching (weight: 4)
    if (searchCriteria.gender && record.gender) {
        const weight = 4;
        totalWeight += weight;
        if (normalize(record.gender) === normalize(searchCriteria.gender)) {
            score += weight;
        }
    }

    // Age range matching (weight: 6)
    if (searchCriteria.age_range && record.date_of_birth) {
        const weight = 6;
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
    
    // Sort buckets by score and return top 12
    const sortedBuckets = Object.entries(bucketScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
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
    const startTime = Date.now();
    
    // Initialize visualization capture
    const vizData = initializeVisualization();
    
    // Data structures
    const fitnessMap = new Map(); // blockIndex -> fitness
    const exploredSet = new Set(); // Set of evaluated blockIndex
    const ipfsCache = new Map(); // blockIndex -> ipfsData
    
    // Get all data
    let allBlocks = await getAllBlocks();
    
    // Filter by doctor if doctorId is provided
    if (searchCriteria.doctorId) {
        console.log(`🔍 Filtering records for doctor: ${searchCriteria.doctorId}`);
        allBlocks = allBlocks.filter(b => b.doc === searchCriteria.doctorId);
        console.log(`✅ Found ${allBlocks.length} records for this doctor`);
    }
    
    const allBuckets = getAllBuckets();
    const totalRecords = allBlocks.filter(b => b.block_index !== 0).length;
    
    // Get relevant buckets from search criteria
    const relevantBuckets = getRelevantBuckets(searchCriteria);
    
    // Initialize 5 populations
    const NUM_POPULATIONS = 5;
    const INITIAL_POP_SIZE = 100;
    const populations = Array(NUM_POPULATIONS).fill(null).map(() => []);
    const neighborhoods = Array(NUM_POPULATIONS).fill(null).map(() => []);
    
    // ========================================
    // GENERATION 1: Initialize populations
    // ========================================
    console.log('\n📍 GEN 1: Initializing populations');
    
    // Display fitness weights configuration
    console.log('\n⚖️  FITNESS WEIGHTS CONFIGURATION:');
    console.log('   Primary Diagnosis:     28% (Highest Priority)');
    console.log('   Symptoms:              18%');
    console.log('   Body Parts:            12%');
    console.log('   Secondary Diagnosis:   10%');
    console.log('   Treatments:            10%');
    console.log('   Medications:           10%');
    console.log('   Conditions:             8%');
    console.log('   File Type:              6%');
    console.log('   Age Range:              6%');
    console.log('   Gender:                 4%');
    console.log('   ─────────────────────────');
    console.log('   Total Possible:       112%\n');
    
    console.log('🎯 GRADUATED THRESHOLDS:');
    console.log('   Gen 1:      95% required');
    console.log('   Gen 2:      90% required');
    console.log('   Gen 3-5:    85% required');
    console.log('   Gen 6-9:    80% required');
    console.log('   Gen 10-15:  77% required');
    console.log('   Gen 16+:    72% required\n');
    
    // Track initial sampling and fitness evaluation for visualization
    const gen1InitialSampling = [];
    const gen1FitnessEvaluation = [];
    
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
        
        // Capture initial sampling (before fitness)
        gen1InitialSampling.push(captureInitialSampling(popIndex, population, allBlocks, ipfsCache));
    }
    
    // Evaluate fitness for all records in Gen 1
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
            }
        }
    }
    
    // Capture fitness evaluation (before selection to top 50)
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        gen1FitnessEvaluation.push(
            captureFitnessEvaluation(popIndex, populations[popIndex], fitnessMap, allBlocks, ipfsCache)
        );
    }
    
    // Remove bottom 50 from each population
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        populations[popIndex].sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
        populations[popIndex] = populations[popIndex].slice(0, 50);
    }
    
    // Calculate neighborhoods
    for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
        neighborhoods[popIndex] = calculateNeighborhood(populations[popIndex], fitnessMap, allBuckets);
    }
    
    // Check for 95% fitness in Gen 1 (graduated threshold)
    let bestFitness = Math.max(...Array.from(fitnessMap.values()));
    let foundHighFitness = false;
    let highFitnessRecord = null;
    
    // Find the record with best fitness if >= 95%
    if (bestFitness >= 95) {
        for (const [blockIndex, fitness] of fitnessMap.entries()) {
            if (fitness >= 95) {
                foundHighFitness = true;
                highFitnessRecord = blockIndex;
                break;
            }
        }
    }
    
    // Capture Generation 1 snapshot (with initial sampling and fitness evaluation)
    vizData.generations.push(
        captureGenerationSnapshot(1, populations, fitnessMap, neighborhoods, allBlocks, ipfsCache, false, gen1InitialSampling, gen1FitnessEvaluation, highFitnessRecord)
    );
    
    // ========================================
    // GENERATIONS 2+
    // ========================================
    let generation = 2;
    
    // If already found 85%+ in Gen 1, skip to refinement
    while (generation <= 50 && exploredSet.size < totalRecords && !foundHighFitness) {
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
            newRecords.forEach(idx => exploredSet.add(idx));
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
                    fitnessMap.set(blockIndex, fitness);
                    
                    // Graduated threshold based on generation
                    let threshold;
                    if (generation === 2) threshold = 90;
                    else if (generation >= 3 && generation <= 5) threshold = 85;
                    else if (generation >= 6 && generation <= 9) threshold = 80;
                    else if (generation >= 10 && generation <= 15) threshold = 77;
                    else threshold = 72; // Gen 16+
                    
                    // Check for threshold fitness - STOP IMMEDIATELY
                    if (fitness >= threshold && !foundHighFitness) {
                        foundHighFitness = true;
                        highFitnessRecord = blockIndex;
                        break; // Exit fitness evaluation loop
                    }
                }
            }
            
            // Sort and keep top 50 (ALWAYS do this, even if high fitness found)
            population.sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
            populations[popIndex] = population.slice(0, 50);
            
            // If high fitness found, stop processing other populations
            if (foundHighFitness) {
                break;
            }
        }
        
        // If high fitness found, capture snapshot and exit generation loop
        if (foundHighFitness) {
            // Recalculate neighborhoods for all populations before snapshot
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                neighborhoods[popIndex] = calculateNeighborhood(populations[popIndex], fitnessMap, allBuckets);
            }
            
            // Capture generation snapshot with the high fitness record
            vizData.generations.push(
                captureGenerationSnapshot(generation, populations, fitnessMap, neighborhoods, allBlocks, ipfsCache, false, null, null, highFitnessRecord)
            );
            
            break;
        }
        
        // Crossover every 2 generations
        if (generation % 2 === 0) {
            // Capture crossover operation for visualization
            const crossoverExchanges = [];
            
            // Store records to exchange FROM each population
            const toExchange = [];
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                const currentPop = populations[popIndex];
                // Get ranks #2, #4, #6, #8, #10 (indices 1, 3, 5, 7, 9)
                const exchangeIndices = [1, 3, 5, 7, 9];
                const records = exchangeIndices.map(i => currentPop[i]).filter(x => x !== undefined);
                toExchange.push(records);
            }
            
            // Exchange circularly: pop0 receives from pop4, pop1 from pop0, etc.
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                const currentPop = populations[popIndex];
                const prevPopIndex = (popIndex - 1 + NUM_POPULATIONS) % NUM_POPULATIONS;
                const receivedRecords = toExchange[prevPopIndex]; // Receive from PREVIOUS population
                
                // Track crossover for visualization
                crossoverExchanges.push({
                    from: prevPopIndex,
                    to: popIndex,
                    ranks: [2, 4, 6, 8, 10]
                });
                
                // Remove the exchanged records from current population
                const exchangeIndices = [1, 3, 5, 7, 9];
                const remaining = currentPop.filter((_, i) => !exchangeIndices.includes(i));
                
                // Add received records and sort
                remaining.push(...receivedRecords);
                remaining.sort((a, b) => (fitnessMap.get(b) || 0) - (fitnessMap.get(a) || 0));
                populations[popIndex] = remaining.slice(0, 50);
            }
            
            // Save crossover operation
            vizData.crossovers.push(captureCrossover(generation, crossoverExchanges));
            
            // Recalculate neighborhoods after crossover
            for (let popIndex = 0; popIndex < NUM_POPULATIONS; popIndex++) {
                neighborhoods[popIndex] = calculateNeighborhood(populations[popIndex], fitnessMap, allBuckets);
            }
        }
        
        // Capture generation snapshot
        vizData.generations.push(
            captureGenerationSnapshot(generation, populations, fitnessMap, neighborhoods, allBlocks, ipfsCache, generation % 2 === 0, null, null, foundHighFitness ? highFitnessRecord : null)
        );
        
        generation++;
    }
    
    // ========================================
    // REFINEMENT GENERATION (if 85%+ found)
    // ========================================
    if (foundHighFitness && highFitnessRecord) {
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
        
        // Sample heavily from these buckets (only unexplored records)
        const refinementSamples = sampleFromNeighborhood(refinementBuckets, allBuckets, 100, exploredSet);
        refinementSamples.forEach(idx => exploredSet.add(idx));
        
        // Evaluate these records
        for (const blockIndex of refinementSamples) {
            if (!fitnessMap.has(blockIndex)) {
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
            }
        }
        
        // Capture refinement generation
        const triggerBlock = allBlocks.find(b => b.block_index === highFitnessRecord);
        const triggerIPFS = ipfsCache.get(highFitnessRecord);
        vizData.refinementGeneration = captureRefinementGeneration(
            generation,
            { blockIndex: highFitnessRecord, block: triggerBlock, ipfsData: triggerIPFS },
            refinementSamples,
            fitnessMap,
            allBlocks,
            ipfsCache
        );
        
        generation++; // Count refinement as a generation
    }
    
    vizData.totalGenerations = generation - 1;
    
    // ========================================
    // COLLECT TOP N RESULTS
    // ========================================
    // Get all evaluated records sorted by fitness
    const allEvaluated = Array.from(fitnessMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
    
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
    
    // Save visualization data for last run
    saveVisualizationData(vizData);
    
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
