/**
 * GA Visualization Helper
 * Captures and formats data for GA algorithm visualization
 * DOES NOT modify the main GA logic - only observes and records
 */

let lastRunVisualization = null;

/**
 * Initialize visualization data structure
 */
export function initializeVisualization() {
    return {
        generations: [],
        crossovers: [],
        refinementGeneration: null,
        totalGenerations: 0,
        startTime: Date.now(),
        endTime: null
    };
}

/**
 * Capture initial population sampling (before fitness calculation)
 */
export function captureInitialSampling(populationIndex, sampledRecords, allBlocks, ipfsCache) {
    return {
        populationIndex: populationIndex + 1,
        totalSampled: sampledRecords.length,
        sampleRecords: sampledRecords.slice(0, 4).map(blockIndex => {
            const block = allBlocks.find(b => b.block_index === blockIndex);
            const ipfsData = ipfsCache.get(blockIndex);
            return {
                blockIndex,
                diagnosis: ipfsData?.primary_diagnosis || 'N/A',
                patientId: block?.patient_id || 'N/A'
            };
        })
    };
}

/**
 * Capture fitness-evaluated population (after fitness, before selection)
 */
export function captureFitnessEvaluation(populationIndex, population, fitnessMap, allBlocks, ipfsCache) {
    const recordsWithFitness = population.map(blockIndex => ({
        blockIndex,
        fitness: fitnessMap.get(blockIndex) || 0,
        block: allBlocks.find(b => b.block_index === blockIndex),
        ipfsData: ipfsCache.get(blockIndex)
    })).sort((a, b) => b.fitness - a.fitness);
    
    return {
        populationIndex: populationIndex + 1,
        totalRecords: population.length,
        sampleRecords: recordsWithFitness.slice(0, 4).map(r => ({
            blockIndex: r.blockIndex,
            fitness: r.fitness.toFixed(2),
            diagnosis: r.ipfsData?.primary_diagnosis || 'N/A',
            patientId: r.block?.patient_id || 'N/A'
        })),
        topFitness: recordsWithFitness[0]?.fitness.toFixed(2) || '0.00'
    };
}

/**
 * Capture generation snapshot (after selection)
 */
export function captureGenerationSnapshot(
    generationNumber,
    populations,
    fitnessMap,
    neighborhoods,
    allBlocks,
    ipfsCache,
    isCrossover = false,
    initialSampling = null,
    fitnessEvaluation = null
) {
    const snapshot = {
        generation: generationNumber,
        isCrossover: isCrossover,
        initialSampling: initialSampling || null,
        fitnessEvaluation: fitnessEvaluation || null,
        populations: []
    };
    
    // Capture each population (after selection to top 50)
    populations.forEach((population, popIndex) => {
        // Get top 4 records from this population by fitness
        const populationRecords = population
            .map(blockIndex => ({
                blockIndex,
                fitness: fitnessMap.get(blockIndex) || 0,
                block: allBlocks.find(b => b.block_index === blockIndex),
                ipfsData: ipfsCache.get(blockIndex)
            }))
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, 4);
        
        // Get top fitness
        const topFitness = populationRecords[0]?.fitness || 0;
        
        // Format neighborhood buckets
        const neighborhoodBuckets = neighborhoods[popIndex] || [];
        
        snapshot.populations.push({
            populationIndex: popIndex + 1,
            size: population.length,
            topFitness: topFitness.toFixed(2),
            sampleRecords: populationRecords.map(r => ({
                blockIndex: r.blockIndex,
                fitness: r.fitness.toFixed(2),
                diagnosis: r.ipfsData?.primary_diagnosis || 'N/A',
                patientId: r.block?.patient_id || 'N/A'
            })),
            neighborhoodBuckets: neighborhoodBuckets.slice(0, 5) // Top 5 buckets
        });
    });
    
    return snapshot;
}

/**
 * Capture crossover operation
 */
export function captureCrossover(generationNumber, exchanges) {
    return {
        generation: generationNumber,
        exchanges: exchanges.map(ex => ({
            from: ex.from + 1,
            to: ex.to + 1,
            ranks: ex.ranks
        }))
    };
}

/**
 * Capture refinement generation
 */
export function captureRefinementGeneration(
    generationNumber,
    triggerRecord,
    sampledRecords,
    fitnessMap,
    allBlocks,
    ipfsCache
) {
    // Get top 4 from refinement
    const topRecords = sampledRecords
        .map(blockIndex => ({
            blockIndex,
            fitness: fitnessMap.get(blockIndex) || 0,
            block: allBlocks.find(b => b.block_index === blockIndex),
            ipfsData: ipfsCache.get(blockIndex)
        }))
        .sort((a, b) => b.fitness - a.fitness)
        .slice(0, 4);
    
    return {
        generation: generationNumber,
        triggerFitness: fitnessMap.get(triggerRecord.blockIndex).toFixed(2),
        triggerDiagnosis: triggerRecord.ipfsData?.primary_diagnosis || 'N/A',
        sampledCount: sampledRecords.length,
        topRecords: topRecords.map(r => ({
            blockIndex: r.blockIndex,
            fitness: r.fitness.toFixed(2),
            diagnosis: r.ipfsData?.primary_diagnosis || 'N/A',
            fileType: r.block?.file_type || 'N/A'
        }))
    };
}

/**
 * Save complete visualization data for last run
 */
export function saveVisualizationData(vizData) {
    vizData.endTime = Date.now();
    vizData.duration = ((vizData.endTime - vizData.startTime) / 1000).toFixed(2);
    lastRunVisualization = vizData;
}

/**
 * Get last run visualization data
 */
export function getLastVisualization() {
    return lastRunVisualization;
}

/**
 * Format visualization for frontend
 * Returns first 4 gens + last 3 gens + refinement gen (if exists)
 */
export function formatVisualizationForDisplay() {
    if (!lastRunVisualization) {
        return null;
    }
    
    const { generations, crossovers, refinementGeneration, totalGenerations, duration } = lastRunVisualization;
    
    if (generations.length === 0) {
        return null;
    }
    
    // Get first 4 generations
    const firstGens = generations.slice(0, Math.min(4, generations.length));
    
    // Get last 3 generations (excluding refinement if it's last)
    const lastGens = refinementGeneration && generations[generations.length - 1] === refinementGeneration
        ? generations.slice(Math.max(0, generations.length - 4), -1).slice(-3)
        : generations.slice(-3);
    
    // Determine which crossovers to show (for gen 2 and gen 4)
    const relevantCrossovers = crossovers.filter(c => 
        c.generation === 2 || c.generation === 4
    );
    
    return {
        totalGenerations,
        duration,
        firstGenerations: firstGens,
        lastGenerations: lastGens,
        crossovers: relevantCrossovers,
        refinementGeneration: refinementGeneration,
        skippedGenerations: Math.max(0, totalGenerations - firstGens.length - lastGens.length - (refinementGeneration ? 1 : 0))
    };
}
