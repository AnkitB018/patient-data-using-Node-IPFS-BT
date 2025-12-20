import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project'
});

async function fixBlockIndex() {
    try {
        await client.connect();
        console.log('✅ Connected to Medical_project database\n');
        
        // Check if block_index is already a sequence
        console.log('🔍 Checking current block_index setup...');
        const checkSeq = await client.query(`
            SELECT column_default 
            FROM information_schema.columns 
            WHERE table_name = 'blockchain_metadata' 
            AND column_name = 'block_index'
        `);
        
        console.log('Current block_index default:', checkSeq.rows[0].column_default);
        
        if (checkSeq.rows[0].column_default && checkSeq.rows[0].column_default.includes('nextval')) {
            console.log('✅ block_index is already auto-increment!\n');
        } else {
            console.log('🔧 Creating sequence for block_index...\n');
            
            // Create a sequence
            await client.query(`
                CREATE SEQUENCE IF NOT EXISTS blockchain_metadata_block_index_seq;
            `);
            
            // Set the sequence to start after current max value
            await client.query(`
                SELECT setval('blockchain_metadata_block_index_seq', 
                    COALESCE((SELECT MAX(block_index) FROM blockchain_metadata), 0) + 1, 
                    false
                );
            `);
            
            // Set block_index to use the sequence as default
            await client.query(`
                ALTER TABLE blockchain_metadata 
                ALTER COLUMN block_index SET DEFAULT nextval('blockchain_metadata_block_index_seq');
            `);
            
            console.log('✅ block_index is now auto-increment!\n');
        }
        
        console.log('✅ All changes completed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

fixBlockIndex();
