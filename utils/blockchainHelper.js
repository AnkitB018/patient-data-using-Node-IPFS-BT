/**
 * Blockchain API Helper
 * Communicates with Flask blockchain service
 */

import axios from 'axios';

const BLOCKCHAIN_API = process.env.BLOCKCHAIN_API_URL || 'http://localhost:5002';

/**
 * Add a block to the blockchain
 * @param {Object} data - Block data
 * @returns {Promise<Object>} Response from blockchain API
 */
async function addBlockToChain(data) {
    try {
        const response = await axios.post(`${BLOCKCHAIN_API}/api/blockchain/add`, data);
        return response.data;
    } catch (error) {
        console.error('Blockchain API error:', error.message);
        throw new Error('Failed to add block to blockchain');
    }
}

// Unused functions - kept for potential future use
/*
/**
 * Get the entire blockchain
 * @returns {Promise<Array>} Array of blocks
 */
/*
async function getBlockchain() {
    try {
        const response = await axios.get(`${BLOCKCHAIN_API}/api/blockchain`);
        return response.data.chain;
    } catch (error) {
        console.error('Blockchain API error:', error.message);
        throw new Error('Failed to fetch blockchain');
    }
}

/**
 * Get blocks for a specific patient
 * @param {string} patientId - Patient ID
 * @returns {Promise<Array>} Array of blocks
 */
/*
async function getPatientBlocks(patientId) {
    try {
        const response = await axios.get(`${BLOCKCHAIN_API}/api/blockchain/patient/${patientId}`);
        return response.data.blocks;
    } catch (error) {
        console.error('Blockchain API error:', error.message);
        return [];
    }
}

/**
 * Validate blockchain integrity
 * @returns {Promise<Object>} Validation result
 */
/*
async function validateBlockchain() {
    try {
        const response = await axios.get(`${BLOCKCHAIN_API}/api/blockchain/validate`);
        return response.data;
    } catch (error) {
        console.error('Blockchain API error:', error.message);
        throw new Error('Failed to validate blockchain');
    }
}

/**
 * Get blockchain statistics
 * @returns {Promise<Object>} Stats object
 */
/*
async function getBlockchainStats() {
    try {
        const response = await axios.get(`${BLOCKCHAIN_API}/api/blockchain/stats`);
        return response.data;
    } catch (error) {
        console.error('Blockchain API error:', error.message);
        throw new Error('Failed to fetch blockchain stats');
    }
}

/**
 * Check if blockchain API is healthy
 * @returns {Promise<boolean>} True if API is running
 */
/*
async function checkBlockchainHealth() {
    try {
        const response = await axios.get(`${BLOCKCHAIN_API}/api/health`);
        return response.data.status === 'healthy';
    } catch (error) {
        return false;
    }
}
*/

export {
    addBlockToChain
};
