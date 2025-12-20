/**
 * Database Helper
 * PostgreSQL connection and query utilities
 */

import pg from 'pg';
const { Pool } = pg;

// Create connection pool
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('📦 Database pool connected');
});

pool.on('error', (err) => {
    console.error('Database pool error:', err);
});

// ===========================================
// USER OPERATIONS
// ===========================================

/**
 * Get user by username (checks both patients and doctors)
 */
export async function getUserByUsername(username) {
    try {
        // Check patients table first
        const patientResult = await pool.query(
            'SELECT * FROM patients WHERE username = $1',
            [username]
        );
        
        if (patientResult.rows.length > 0) {
            const user = patientResult.rows[0];
            return {
                username: user.username,
                password: user.password,
                role: 'patient',
                patient_id: user.patient_id,
                full_name: user.username, // Using username as name for now
                gender: user.gender,
                date_of_birth: user.date_of_birth,
                blood_group: user.blood_group,
                phone: user.contact,
                email: user.email,
                height: user.height,
                weight: user.weight,
                address: user.email, // placeholder
                current_conditions: user.current_conditions
            };
        }
        
        // Check doctors table
        const doctorResult = await pool.query(
            'SELECT * FROM doctors WHERE username = $1',
            [username]
        );
        
        if (doctorResult.rows.length > 0) {
            const user = doctorResult.rows[0];
            return {
                username: user.username,
                password: user.password,
                role: 'doctor',
                doctor_id: user.doctor_id,
                full_name: user.username,
                gender: user.gender,
                specialization: user.specialization,
                license_number: user.license_number,
                phone: user.contact,
                email: user.email
            };
        }
        
        // Check if it's admin (hardcoded for testing)
        if (username === 'admin') {
            return {
                username: 'admin',
                password: 'admin', // Plain text for testing
                role: 'admin',
                full_name: 'System Administrator'
            };
        }
        
        return null;
    } catch (error) {
        console.error('getUserByUsername error:', error);
        throw error;
    }
}

/**
 * Create new patient
 */
export async function createPatient(patientData) {
    const {
        patient_id,
        username,
        password,
        gender,
        date_of_birth,
        blood_group,
        contact,
        email,
        height,
        weight,
        current_conditions
    } = patientData;
    
    try {
        const result = await pool.query(
            `INSERT INTO patients 
            (patient_id, username, password, gender, date_of_birth, blood_group, 
             contact, email, height, weight, current_conditions, updation_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
            RETURNING *`,
            [patient_id, username, password, gender, date_of_birth, blood_group, 
             contact, email, height, weight, current_conditions]
        );
        
        return result.rows[0];
    } catch (error) {
        console.error('createPatient error:', error);
        throw error;
    }
}

/**
 * Update patient data
 */
export async function updatePatient(username, updateData) {
    try {
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        // Build dynamic UPDATE query
        for (const [key, value] of Object.entries(updateData)) {
            if (value !== undefined) {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        
        if (fields.length === 0) {
            return null;
        }
        
        fields.push(`updation_date = CURRENT_TIMESTAMP`);
        values.push(username);
        
        const query = `
            UPDATE patients 
            SET ${fields.join(', ')}
            WHERE username = $${paramCount}
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('updatePatient error:', error);
        throw error;
    }
}

/**
 * Get all patients
 */
export async function getAllPatients() {
    try {
        const result = await pool.query('SELECT * FROM patients ORDER BY patient_id');
        return result.rows;
    } catch (error) {
        console.error('getAllPatients error:', error);
        throw error;
    }
}

// ===========================================
// BLOCKCHAIN OPERATIONS
// ===========================================

/**
 * Get all blockchain records
 */
export async function getAllBlocks() {
    try {
        const result = await pool.query(
            'SELECT * FROM blockchain_metadata ORDER BY block_index'
        );
        return result.rows;
    } catch (error) {
        console.error('getAllBlocks error:', error);
        throw error;
    }
}

/**
 * Get blocks for specific patient
 */
export async function getPatientBlocks(patientId) {
    try {
        const result = await pool.query(
            'SELECT * FROM blockchain_metadata WHERE patient_id = $1 ORDER BY block_index DESC',
            [patientId]
        );
        return result.rows;
    } catch (error) {
        console.error('getPatientBlocks error:', error);
        throw error;
    }
}

/**
 * Add new block to blockchain
 */
export async function addBlock(blockData) {
    const {
        block_hash,
        previous_hash,
        timestamp,
        nonce,
        ipfs_cid,
        patient_id,
        file_type,
        file_status
    } = blockData;
    
    try {
        const result = await pool.query(
            `INSERT INTO blockchain_metadata 
            (block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status]
        );
        
        return result.rows[0];
    } catch (error) {
        console.error('addBlock error:', error);
        throw error;
    }
}

/**
 * Get blockchain stats
 */
export async function getBlockchainStats() {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_blocks,
                COUNT(DISTINCT patient_id) as total_patients
            FROM blockchain_metadata
        `);
        
        return result.rows[0];
    } catch (error) {
        console.error('getBlockchainStats error:', error);
        throw error;
    }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Execute raw query
 */
export async function query(text, params) {
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
}

/**
 * Close database connection pool
 */
export async function closePool() {
    await pool.end();
}

export default pool;
