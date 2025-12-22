/**
 * IPFS Helper Functions
 * Handles all IPFS operations (upload, fetch, pin)
 */

import { create } from 'ipfs-http-client';

// Create IPFS client
const ipfs = create({
    host: process.env.IPFS_HOST || 'localhost',
    port: process.env.IPFS_PORT || 5001,
    protocol: process.env.IPFS_PROTOCOL || 'http'
});

/**
 * Upload JSON metadata to IPFS
 * @param {Object} metadata - Metadata object to upload
 * @returns {Promise<string>} CID of uploaded content
 */
async function uploadMetadataToIPFS(metadata) {
    try {
        const result = await ipfs.add(JSON.stringify(metadata));
        return result.path; // This is the CID
    } catch (error) {
        console.error('IPFS upload error:', error);
        throw new Error('Failed to upload to IPFS: ' + error.message);
    }
}

/**
 * Fetch content from IPFS by CID
 * @param {string} cid - Content Identifier
 * @returns {Promise<Object>} Parsed JSON content
 */
async function fetchFromIPFS(cid) {
    try {
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);
        return JSON.parse(data.toString());
    } catch (error) {
        console.error('IPFS fetch error:', error);
        throw new Error('Failed to fetch from IPFS: ' + error.message);
    }
}

/**
 * Check IPFS connection
 * @returns {Promise<boolean>} True if connected
 */
async function checkIPFSConnection() {
    try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('IPFS timeout')), 3000)
        );
        
        const versionPromise = ipfs.version();
        
        await Promise.race([versionPromise, timeoutPromise]);
        return true;
    } catch (error) {
        console.error('IPFS connection error:', error.message);
        return false;
    }
}

/**
 * Pin content to IPFS (prevent garbage collection)
 * @param {string} cid - Content Identifier to pin
 */
async function pinContent(cid) {
    try {
        await ipfs.pin.add(cid);
        console.log(`✅ Pinned content: ${cid}`);
    } catch (error) {
        console.error('IPFS pin error:', error);
        throw new Error('Failed to pin content: ' + error.message);
    }
}

export {
    uploadMetadataToIPFS,
    fetchFromIPFS,
    checkIPFSConnection,
    pinContent,
    ipfs
};
