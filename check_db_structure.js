import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project'
});

async function checkDatabase() {
    try {
        console.log('=== PATIENTS ===');
        const patients = await pool.query('SELECT * FROM patients ORDER BY patient_id LIMIT 10');
        console.log(JSON.stringify(patients.rows, null, 2));
        
        console.log('\n=== DOCTORS ===');
        const doctors = await pool.query('SELECT * FROM doctors ORDER BY doctor_id LIMIT 10');
        console.log(JSON.stringify(doctors.rows, null, 2));
        
        console.log('\n=== BLOCKCHAIN_METADATA (sample) ===');
        const blocks = await pool.query('SELECT * FROM blockchain_metadata ORDER BY block_index DESC LIMIT 5');
        console.log(JSON.stringify(blocks.rows, null, 2));
        
        console.log('\n=== TABLE STRUCTURE: blockchain_metadata ===');
        const structure = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'blockchain_metadata'
            ORDER BY ordinal_position
        `);
        console.log(JSON.stringify(structure.rows, null, 2));
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDatabase();
