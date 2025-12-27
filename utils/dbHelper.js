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
 * Generate unique patient ID (format: P0001, P0002, etc.)
 */
export async function generateUniquePatientId() {
    try {
        // Get the count of existing patients
        const result = await pool.query('SELECT COUNT(*) as count FROM patients');
        const count = parseInt(result.rows[0].count);
        
        // Generate new ID with format P0001, P0002, etc.
        const newId = `P${String(count + 1).padStart(4, '0')}`;
        
        // Double-check if ID already exists (safety check)
        const existingCheck = await pool.query(
            'SELECT patient_id FROM patients WHERE patient_id = $1',
            [newId]
        );
        
        if (existingCheck.rows.length > 0) {
            // If somehow it exists, recursively try next number
            const nextCount = count + 1;
            const nextId = `P${String(nextCount + 1).padStart(4, '0')}`;
            return nextId;
        }
        
        return newId;
    } catch (error) {
        console.error('generateUniquePatientId error:', error);
        throw error;
    }
}

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
 * Get patient by ID
 */
export async function getPatientById(patient_id) {
    try {
        const result = await pool.query(
            'SELECT * FROM patients WHERE patient_id = $1',
            [patient_id]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('getPatientById error:', error);
        throw error;
    }
}

/**
 * Update patient data
 */
export async function updatePatient(patient_id, updateData) {
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
        values.push(patient_id);
        
        const query = `
            UPDATE patients 
            SET ${fields.join(', ')}
            WHERE patient_id = $${paramCount}
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
 * Get blocks for specific patient (optionally filtered by doctor)
 */
export async function getPatientBlocks(patientId, doctorId = null) {
    try {
        let query, params;
        
        if (doctorId) {
            // Filter by doctor_id
            query = 'SELECT * FROM blockchain_metadata WHERE patient_id = $1 AND doc = $2 ORDER BY block_index DESC';
            params = [patientId, doctorId];
        } else {
            // Admin can see all records
            query = 'SELECT * FROM blockchain_metadata WHERE patient_id = $1 ORDER BY block_index DESC';
            params = [patientId];
        }
        
        const result = await pool.query(query, params);
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
        file_status,
        doc
    } = blockData;
    
    try {
        const result = await pool.query(
            `INSERT INTO blockchain_metadata 
            (block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status, doc)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status, doc]
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
 * Get doctor by username
 */
export async function getDoctorByUsername(username) {
    try {
        const result = await pool.query(
            'SELECT * FROM doctors WHERE username = $1',
            [username]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('getDoctorByUsername error:', error);
        throw error;
    }
}

/**
 * Create new doctor
 */
export async function createDoctor(doctorData) {
    const {
        doctor_id,
        username,
        password,
        gender,
        specialization,
        license_number,
        contact,
        email
    } = doctorData;
    
    try {
        const result = await pool.query(
            `INSERT INTO doctors 
            (doctor_id, username, password, gender, specialization, license_number, 
             contact, email, updation_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            RETURNING *`,
            [doctor_id, username, password, gender, specialization, license_number, 
             contact, email]
        );
        
        return result.rows[0];
    } catch (error) {
        console.error('createDoctor error:', error);
        throw error;
    }
}

/**
 * Generate unique doctor ID (format: D0001, D0002, ...)
 */
export async function generateUniqueDoctorId() {
    try {
        const result = await pool.query(
            `SELECT doctor_id FROM doctors 
             WHERE doctor_id ~ '^D[0-9]+$' 
             ORDER BY CAST(SUBSTRING(doctor_id FROM 2) AS INTEGER) DESC 
             LIMIT 1`
        );
        
        if (result.rows.length === 0) {
            return 'D0001';
        }
        
        const lastId = result.rows[0].doctor_id;
        const numericPart = parseInt(lastId.substring(1)) + 1;
        const newId = 'D' + numericPart.toString().padStart(4, '0');
        
        return newId;
    } catch (error) {
        console.error('generateUniqueDoctorId error:', error);
        throw error;
    }
}

/**
 * Get all doctors
 */
export async function getAllDoctors() {
    try {
        const result = await pool.query(
            'SELECT * FROM doctors ORDER BY doctor_id'
        );
        return result.rows;
    } catch (error) {
        console.error('getAllDoctors error:', error);
        throw error;
    }
}

/**
 * Assign doctor to patient
 */
export async function assignDoctorToPatient(doctorId, patientId) {
    try {
        // Check if relation already exists
        const existing = await pool.query(
            'SELECT * FROM doc_pat_relation WHERE doc_id = $1 AND pat_id = $2',
            [doctorId, patientId]
        );
        
        if (existing.rows.length > 0) {
            throw new Error('Doctor already assigned to this patient');
        }
        
        const result = await pool.query(
            'INSERT INTO doc_pat_relation (doc_id, pat_id) VALUES ($1, $2) RETURNING *',
            [doctorId, patientId]
        );
        
        return result.rows[0];
    } catch (error) {
        console.error('assignDoctorToPatient error:', error);
        throw error;
    }
}

/**
 * Remove doctor-patient relation
 */
export async function removeDoctorPatientRelation(doctorId, patientId) {
    try {
        await pool.query(
            'DELETE FROM doc_pat_relation WHERE doc_id = $1 AND pat_id = $2',
            [doctorId, patientId]
        );
    } catch (error) {
        console.error('removeDoctorPatientRelation error:', error);
        throw error;
    }
}

/**
 * Get all doctor-patient relations
 */
export async function getAllDoctorPatientRelations() {
    try {
        const result = await pool.query(
            `SELECT 
                dpr.id,
                dpr.doc_id,
                dpr.pat_id,
                d.username as doctor_name,
                d.specialization,
                p.username as patient_name
             FROM doc_pat_relation dpr
             JOIN doctors d ON dpr.doc_id = d.doctor_id
             JOIN patients p ON dpr.pat_id = p.patient_id
             ORDER BY dpr.id DESC`
        );
        return result.rows;
    } catch (error) {
        console.error('getAllDoctorPatientRelations error:', error);
        throw error;
    }
}

/**
 * Get patients for a specific doctor
 */
export async function getPatientsForDoctor(doctorId) {
    try {
        const result = await pool.query(
            `SELECT p.* 
             FROM patients p
             JOIN doc_pat_relation dpr ON p.patient_id = dpr.pat_id
             WHERE dpr.doc_id = $1
             ORDER BY p.patient_id`,
            [doctorId]
        );
        return result.rows;
    } catch (error) {
        console.error('getPatientsForDoctor error:', error);
        throw error;
    }
}

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

// ===========================================
// CONSENT OPERATIONS
// ===========================================

/**
 * Grant consent to doctor or patient
 */
export async function grantConsent(patient_id, granted_to_doctor, granted_to_patient, record_id = null) {
    try {
        const consent_id = `C${Date.now()}`;
        const query = `
            INSERT INTO consent_records 
            (consent_id, patient_id, granted_doctor, granted_patient, record_id, grant_date)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            consent_id,
            patient_id,
            granted_to_doctor,
            granted_to_patient,
            record_id
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('grantConsent error:', error);
        throw error;
    }
}

/**
 * Get all consents granted by a patient
 */
export async function getGrantedConsents(patient_id) {
    try {
        const query = `
            SELECT c.*, 
                   d.username as doctor_name,
                   p.username as patient_name,
                   b.file_type, b.timestamp as record_date
            FROM consent_records c
            LEFT JOIN doctors d ON c.granted_doctor = d.doctor_id
            LEFT JOIN patients p ON c.granted_patient = p.patient_id
            LEFT JOIN blockchain_metadata b ON c.record_id = b.block_index
            WHERE c.patient_id = $1
            ORDER BY c.grant_date DESC
        `;
        
        const result = await pool.query(query, [patient_id]);
        return result.rows;
    } catch (error) {
        console.error('getGrantedConsents error:', error);
        throw error;
    }
}

/**
 * Get consents granted to a user (doctor or patient)
 */
export async function getReceivedConsents(user_id, user_type) {
    try {
        const field = user_type === 'doctor' ? 'granted_doctor' : 'granted_patient';
        const query = `
            SELECT c.*,
                   p.username as patient_name,
                   b.file_type, b.timestamp as record_date, b.ipfs_cid
            FROM consent_records c
            JOIN patients p ON c.patient_id = p.patient_id
            LEFT JOIN blockchain_metadata b ON c.record_id = b.block_index
            WHERE c.${field} = $1
            ORDER BY c.grant_date DESC
        `;
        
        const result = await pool.query(query, [user_id]);
        return result.rows;
    } catch (error) {
        console.error('getReceivedConsents error:', error);
        throw error;
    }
}

/**
 * Get unique patients who granted consent to a user
 */
export async function getPatientsWhoGrantedConsent(user_id, user_type) {
    try {
        const field = user_type === 'doctor' ? 'granted_doctor' : 'granted_patient';
        const query = `
            SELECT DISTINCT c.patient_id, p.username
            FROM consent_records c
            JOIN patients p ON c.patient_id = p.patient_id
            WHERE c.${field} = $1
            ORDER BY p.username
        `;
        
        const result = await pool.query(query, [user_id]);
        return result.rows;
    } catch (error) {
        console.error('getPatientsWhoGrantedConsent error:', error);
        throw error;
    }
}

/**
 * Get consented blocks for a specific patient
 */
export async function getConsentedBlocks(patient_id, viewer_id, viewer_type) {
    try {
        const field = viewer_type === 'doctor' ? 'granted_doctor' : 'granted_patient';
        
        // Get all consents for this patient-viewer pair
        const consentQuery = `
            SELECT record_id 
            FROM consent_records 
            WHERE patient_id = $1 AND ${field} = $2
        `;
        
        const consents = await pool.query(consentQuery, [patient_id, viewer_id]);
        
        // If any consent has null record_id, grant access to all records
        const hasFullAccess = consents.rows.some(c => c.record_id === null);
        
        if (hasFullAccess) {
            // Return all blocks for this patient
            const allBlocksQuery = `
                SELECT * FROM blockchain_metadata 
                WHERE patient_id = $1 
                ORDER BY block_index DESC
            `;
            const result = await pool.query(allBlocksQuery, [patient_id]);
            return result.rows;
        } else {
            // Return only specific consented blocks
            const blockIds = consents.rows.map(c => c.record_id).filter(id => id !== null);
            
            if (blockIds.length === 0) {
                return [];
            }
            
            const specificBlocksQuery = `
                SELECT * FROM blockchain_metadata 
                WHERE patient_id = $1 AND block_index = ANY($2)
                ORDER BY block_index DESC
            `;
            const result = await pool.query(specificBlocksQuery, [patient_id, blockIds]);
            return result.rows;
        }
    } catch (error) {
        console.error('getConsentedBlocks error:', error);
        throw error;
    }
}

/**
 * Withdraw consent
 */
export async function withdrawConsent(consent_id) {
    try {
        const query = 'DELETE FROM consent_records WHERE consent_id = $1 RETURNING *';
        const result = await pool.query(query, [consent_id]);
        return result.rows[0];
    } catch (error) {
        console.error('withdrawConsent error:', error);
        throw error;
    }
}

/**
 * Check if user has consent to view a record
 */
export async function hasConsentToView(patient_id, viewer_id, viewer_type, record_id = null) {
    try {
        const field = viewer_type === 'doctor' ? 'granted_doctor' : 'granted_patient';
        
        // Check for full access (record_id IS NULL) or specific record access
        const query = `
            SELECT COUNT(*) as count 
            FROM consent_records 
            WHERE patient_id = $1 
            AND ${field} = $2 
            AND (record_id IS NULL OR record_id = $3)
        `;
        
        const result = await pool.query(query, [patient_id, viewer_id, record_id]);
        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('hasConsentToView error:', error);
        throw error;
    }
}

export default pool;
