import pg from 'pg';
import { fetchFromIPFS } from './utils/ipfsHelper.js';

const { Pool } = pg;

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project'
});

async function checkIPFS() {
    try {
        // Get a few recent blocks with IPFS CIDs
        const blocks = await pool.query(`
            SELECT block_index, ipfs_cid, patient_id, file_type, doc
            FROM blockchain_metadata
            WHERE ipfs_cid IS NOT NULL AND block_index > 0
            ORDER BY block_index DESC
            LIMIT 5
        `);
        
        console.log('=== SAMPLE IPFS RECORDS ===\n');
        
        for (const block of blocks.rows) {
            console.log(`\nBlock ${block.block_index}: ${block.file_type} for ${block.patient_id} by ${block.doc}`);
            console.log(`CID: ${block.ipfs_cid}`);
            
            try {
                const ipfsData = await fetchFromIPFS(block.ipfs_cid, true);
                console.log('IPFS Data:', JSON.stringify(ipfsData, null, 2));
            } catch (error) {
                console.log('Could not fetch:', error.message);
            }
        }
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkIPFS();
