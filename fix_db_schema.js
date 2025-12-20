import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project'
});

async function fixSchema() {
    try {
        await client.connect();
        console.log('✅ Connected to Medical_project database\n');
        
        // Fix 1: Rename stamp to timestamp in blockchain_metadata
        console.log('🔧 Renaming "stamp" to "timestamp" in blockchain_metadata...');
        await client.query(`
            ALTER TABLE blockchain_metadata 
            RENAME COLUMN stamp TO timestamp;
        `);
        console.log('✅ Column renamed: stamp → timestamp\n');
        
        // Fix 2: Rename lisence_number to license_number in doctors
        console.log('🔧 Fixing typo: "lisence_number" to "license_number" in doctors...');
        await client.query(`
            ALTER TABLE doctors 
            RENAME COLUMN lisence_number TO license_number;
        `);
        console.log('✅ Column renamed: lisence_number → license_number\n');
        
        console.log('✅ All changes completed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

fixSchema();
