/**
 * Utility functions for file operations
 * Handles reading/writing users.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '..', 'users.json');

/**
 * Load users from JSON file
 * @returns {Promise<Object>} Users object
 */
async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return empty object
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

/**
 * Save users to JSON file
 * @param {Object} users - Users object to save
 */
async function saveUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 4));
}

/**
 * Get user by username
 * @param {string} username
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByUsername(username) {
    const users = await loadUsers();
    return users[username] || null;
}

/**
 * Get user by patient ID
 * @param {string} patientId
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByPatientId(patientId) {
    const users = await loadUsers();
    for (const [username, userData] of Object.entries(users)) {
        if (userData.patient_id === patientId) {
            return { username, ...userData };
        }
    }
    return null;
}

/**
 * Create new user
 * @param {string} username
 * @param {Object} userData - User data (password, role, patient_id, etc.)
 */
async function createUser(username, userData) {
    const users = await loadUsers();
    
    // Check if username already exists
    if (users[username]) {
        throw new Error('Username already exists');
    }
    
    users[username] = userData;
    await saveUsers(users);
}

/**
 * Update user data
 * @param {string} username
 * @param {Object} updates - Fields to update
 */
async function updateUser(username, updates) {
    const users = await loadUsers();
    
    if (!users[username]) {
        throw new Error('User not found');
    }
    
    users[username] = { ...users[username], ...updates };
    await saveUsers(users);
}

/**
 * Get all patients (users with role = 'patient')
 * @returns {Promise<Array>} Array of patient objects
 */
async function getAllPatients() {
    const users = await loadUsers();
    const patients = [];
    
    for (const [username, userData] of Object.entries(users)) {
        if (userData.role === 'patient') {
            patients.push({
                username,
                patient_id: userData.patient_id,
                full_name: userData.full_name || username,
                ...userData
            });
        }
    }
    
    return patients;
}

export {
    loadUsers,
    saveUsers,
    getUserByUsername,
    getUserByPatientId,
    createUser,
    updateUser,
    getAllPatients
};
