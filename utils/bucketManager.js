/**
 * Bucket Manager for Multi-Population GA Search
 * 
 * Creates pre-computed buckets at server startup for fast neighborhood lookups.
 * Each record can belong to multiple buckets based on medical attributes.
 * 
 * Bucket Categories:
 * - Diagnosis Buckets (20+ broad medical categories)
 * - File Type Buckets (8-10 types)
 * - Symptom Buckets (12-15 common symptoms)
 * - Body Part Buckets (10-12 major organs/systems)
 * - Age Group Buckets (6 age ranges)
 * - Gender Buckets (2-3 categories)
 * - Status Buckets (Open/Closed)
 */

import pool from './dbHelper.js';
import { fetchFromIPFS } from './ipfsHelper.js';

// ============================================================================
// BUCKET DEFINITIONS
// ============================================================================

const DIAGNOSIS_CATEGORIES = {
    'diabetes': ['diabetes', 'diabetic', 'glucose', 'insulin', 'hyperglycemia', 'type 1', 'type 2', 'dm'],
    'cardiac': ['cardiac', 'heart', 'cardiovascular', 'coronary', 'myocardial', 'angina', 'arrhythmia'],
    'hypertension': ['hypertension', 'high blood pressure', 'htn', 'elevated bp'],
    'hypotension': ['hypotension', 'low blood pressure', 'low bp', 'shock'],
    'heart_failure': ['heart failure', 'chf', 'congestive heart failure', 'cardiac failure'],
    'respiratory': ['respiratory', 'pulmonary', 'lung', 'breathing'],
    'asthma': ['asthma', 'asthmatic', 'bronchospasm', 'wheezing'],
    'copd': ['copd', 'chronic obstructive', 'emphysema', 'chronic bronchitis'],
    'pneumonia': ['pneumonia', 'lung infection', 'pneumonic'],
    'neurological': ['neurological', 'neuro', 'brain'],
    'stroke': ['stroke', 'cva', 'cerebrovascular', 'brain attack', 'ischemic', 'hemorrhagic'],
    'seizure': ['seizure', 'epilepsy', 'convulsion', 'fit', 'epileptic'],
    'migraine': ['migraine', 'severe headache', 'cluster headache'],
    'alzheimer': ['alzheimer', 'dementia', 'cognitive decline', 'memory loss'],
    'parkinson': ['parkinson', 'parkinsons', 'tremor', 'rigidity'],
    'orthopedic': ['orthopedic', 'bone', 'musculoskeletal'],
    'fracture': ['fracture', 'broken bone', 'break', 'fx'],
    'arthritis': ['arthritis', 'joint inflammation', 'osteoarthritis', 'rheumatoid arthritis'],
    'osteoporosis': ['osteoporosis', 'bone density', 'brittle bones'],
    'gastrointestinal': ['gastrointestinal', 'gastro', 'digestive'],
    'gastritis': ['gastritis', 'stomach inflammation', 'gastric'],
    'ulcer': ['ulcer', 'peptic ulcer', 'gastric ulcer', 'duodenal ulcer'],
    'ibs': ['ibs', 'irritable bowel', 'colitis', 'crohn'],
    'renal': ['renal', 'kidney', 'nephro'],
    'kidney_failure': ['kidney failure', 'renal failure', 'ckd', 'chronic kidney', 'esrd'],
    'uti': ['uti', 'urinary tract infection', 'bladder infection', 'cystitis'],
    'hepatic': ['hepatic', 'liver'],
    'cirrhosis': ['cirrhosis', 'liver cirrhosis', 'hepatic fibrosis'],
    'hepatitis': ['hepatitis', 'liver inflammation', 'hep a', 'hep b', 'hep c'],
    'endocrine': ['endocrine', 'hormone'],
    'thyroid': ['thyroid', 'hyperthyroid', 'hypothyroid', 'goiter', 'thyroiditis'],
    'adrenal': ['adrenal', 'cushings', 'addisons', 'adrenal insufficiency'],
    'hematology': ['hematology', 'blood disorder'],
    'anemia': ['anemia', 'low hemoglobin', 'iron deficiency', 'anemic'],
    'leukemia': ['leukemia', 'blood cancer', 'aml', 'all', 'cml', 'cll'],
    'thrombosis': ['thrombosis', 'blood clot', 'dvt', 'embolism'],
    'oncology': ['oncology', 'cancer', 'tumor', 'malignant', 'metastasis', 'chemotherapy', 'radiation'],
    'infectious': ['infectious', 'infection', 'viral', 'bacterial', 'fungal', 'sepsis'],
    'covid': ['covid', 'coronavirus', 'sars-cov-2', 'covid-19'],
    'dermatology': ['dermatology', 'skin', 'dermatitis'],
    'rash': ['rash', 'skin eruption', 'eczema', 'psoriasis'],
    'melanoma': ['melanoma', 'skin cancer', 'malignant mole'],
    'ophthalmology': ['ophthalmology', 'eye', 'vision', 'ocular'],
    'cataract': ['cataract', 'lens opacity'],
    'glaucoma': ['glaucoma', 'eye pressure', 'optic nerve'],
    'ent': ['ent', 'ear nose throat'],
    'sinusitis': ['sinusitis', 'sinus', 'sinus infection'],
    'otitis': ['otitis', 'ear infection', 'ear pain'],
    'psychiatric': ['psychiatric', 'mental', 'psychological'],
    'depression': ['depression', 'depressed', 'major depressive', 'mdd'],
    'anxiety_disorder': ['anxiety', 'panic', 'gad', 'anxiety disorder'],
    'bipolar': ['bipolar', 'manic', 'mania'],
    'schizophrenia': ['schizophrenia', 'psychosis', 'psychotic'],
    'gynecology': ['gynecology', 'gyneco', 'pregnancy', 'obstetric', 'menstrual', 'uterus', 'ovarian'],
    'urology': ['urology', 'urinary', 'bladder', 'prostate'],
    'rheumatology': ['rheumatology', 'rheumatic', 'lupus', 'rheumatoid', 'autoimmune', 'scleroderma'],
    'pediatric': ['pediatric', 'child', 'infant', 'newborn', 'neonatal'],
    'geriatric': ['geriatric', 'elderly', 'aging'],
    'trauma': ['trauma', 'injury', 'accident', 'wound', 'burn', 'laceration'],
    'metabolic': ['metabolic', 'obesity', 'malnutrition', 'vitamin deficiency'],
    'immunology': ['immunology', 'immune', 'allergy', 'immunodeficiency', 'hiv', 'aids']
};

// File types from actual dropdown options in upload forms
// Normalized with underscores to match categorizeFileType output
const FILE_TYPE_CATEGORIES = [
    'blood_test',
    'x_ray',
    'mri_scan',
    'ct_scan',
    'ultrasound',
    'ecg',
    'eeg',
    'pet_scan',
    'prescription',
    'lab_report',
    'pathology_report',
    'discharge_summary',
    'medical_certificate',
    'vaccination_record',
    'operation_notes',
    'biopsy_report',
    'other'
];

const SYMPTOM_CATEGORIES = {
    'fever': ['fever', 'pyrexia', 'temperature', 'febrile', 'high temperature'],
    'pain': ['pain', 'ache', 'painful', 'discomfort', 'sore'],
    'cough': ['cough', 'coughing', 'productive cough', 'dry cough'],
    'dizziness': ['dizziness', 'dizzy', 'vertigo', 'lightheaded', 'imbalance'],
    'fatigue': ['fatigue', 'tired', 'weakness', 'lethargy', 'exhausted', 'malaise'],
    'nausea': ['nausea', 'vomiting', 'emesis', 'sick', 'queasy'],
    'headache': ['headache', 'head pain', 'cephalgia', 'migraine'],
    'dyspnea': ['dyspnea', 'shortness of breath', 'breathing difficulty', 'sob', 'breathless'],
    'chest_pain': ['chest pain', 'chest discomfort', 'angina', 'thoracic pain'],
    'abdominal_pain': ['abdominal pain', 'stomach pain', 'belly pain', 'gastric pain'],
    'edema': ['edema', 'swelling', 'swollen', 'fluid retention'],
    'rash': ['rash', 'skin eruption', 'hives', 'urticaria'],
    'bleeding': ['bleeding', 'hemorrhage', 'blood loss', 'bruising'],
    'numbness': ['numbness', 'tingling', 'paresthesia', 'pins and needles'],
    'confusion': ['confusion', 'disoriented', 'altered mental status', 'delirium'],
    'joint_pain': ['joint pain', 'arthralgia', 'stiff joints'],
    'back_pain': ['back pain', 'backache', 'lumbar pain'],
    'constipation': ['constipation', 'difficult bowel movement'],
    'diarrhea': ['diarrhea', 'loose stool', 'frequent bowel'],
    'insomnia': ['insomnia', 'sleeplessness', 'difficulty sleeping'],
    'anxiety': ['anxiety', 'nervousness', 'worried', 'panic'],
    'weight_loss': ['weight loss', 'losing weight', 'cachexia'],
    'hypertension': ['hypertension', 'high blood pressure', 'elevated bp', 'htn'],
    'hypotension': ['hypotension', 'low blood pressure', 'low bp'],
    'palpitations': ['palpitations', 'rapid heart', 'racing heart', 'tachycardia'],
    'syncope': ['syncope', 'fainting', 'passed out', 'loss of consciousness'],
    'tremor': ['tremor', 'shaking', 'trembling', 'shakes'],
    'seizure': ['seizure', 'convulsion', 'fit', 'epileptic'],
    'vision_problems': ['blurred vision', 'vision loss', 'double vision', 'diplopia'],
    'hearing_loss': ['hearing loss', 'deafness', 'hard of hearing'],
    'difficulty_swallowing': ['dysphagia', 'difficulty swallowing', 'trouble swallowing'],
    'incontinence': ['incontinence', 'urinary incontinence', 'bladder control'],
    'muscle_weakness': ['muscle weakness', 'weakness', 'paralysis', 'paresis']
};

const BODY_PART_CATEGORIES = {
    'head_neck': ['head', 'neck', 'brain', 'skull', 'cervical', 'cranial'],
    'chest': ['chest', 'thorax', 'breast', 'ribs'],
    'heart': ['heart', 'cardiac', 'cardiovascular', 'coronary'],
    'lungs': ['lung', 'pulmonary', 'respiratory', 'bronchial'],
    'abdomen': ['abdomen', 'stomach', 'abdominal', 'belly', 'gastric'],
    'liver': ['liver', 'hepatic'],
    'kidneys': ['kidney', 'renal', 'nephro'],
    'arms': ['arm', 'upper limb', 'hand', 'wrist', 'elbow', 'forearm'],
    'legs': ['leg', 'lower limb', 'foot', 'ankle', 'thigh', 'calf', 'knee'],
    'spine': ['spine', 'spinal', 'back', 'vertebra', 'lumbar', 'thoracic'],
    'joints': ['joint', 'knee', 'elbow', 'shoulder', 'hip', 'ankle', 'wrist'],
    'eyes': ['eye', 'ocular', 'vision', 'optic', 'retina'],
    'ears': ['ear', 'hearing', 'auditory', 'otic'],
    'throat': ['throat', 'pharynx', 'larynx', 'tonsil']
};

const AGE_GROUPS = [
    { name: 'infant', min: 0, max: 2 },
    { name: 'child', min: 3, max: 12 },
    { name: 'adolescent', min: 13, max: 19 },
    { name: 'young_adult', min: 20, max: 39 },
    { name: 'middle_age', min: 40, max: 64 },
    { name: 'senior', min: 65, max: 150 }
];

// ============================================================================
// IN-MEMORY BUCKET STORAGE
// ============================================================================

const buckets = {
    diagnosis: {},      // e.g., { 'diabetes': Set([45, 892, 1024, ...]) }
    fileType: {},       // e.g., { 'blood_test': Set([23, 56, 789, ...]) }
    symptom: {},        // e.g., { 'fever': Set([12, 34, 567, ...]) }
    bodyPart: {},       // e.g., { 'heart': Set([89, 123, 456, ...]) }
    ageGroup: {},       // e.g., { 'senior': Set([45, 67, 890, ...]) }
    gender: {},         // e.g., { 'male': Set([12, 34, 56, ...]) }
    leftover: new Set() // Records not in any specific bucket
};

let bucketsInitialized = false;
let totalRecordsProcessed = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize text for matching
 */
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().trim();
}

/**
 * Check if text contains any keywords from a list
 */
function containsKeywords(text, keywords) {
    const normalized = normalizeText(text);
    return keywords.some(keyword => normalized.includes(keyword));
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

/**
 * Get age group bucket name from age
 */
function getAgeGroup(age) {
    if (age === null) return null;
    const group = AGE_GROUPS.find(g => age >= g.min && age <= g.max);
    return group ? group.name : null;
}

/**
 * Categorize diagnosis text into bucket(s)
 */
function categorizeDiagnosis(diagnosisText) {
    const categories = [];
    const normalized = normalizeText(diagnosisText);
    
    for (const [category, keywords] of Object.entries(DIAGNOSIS_CATEGORIES)) {
        if (containsKeywords(normalized, keywords)) {
            categories.push(category);
        }
    }
    
    return categories;
}

/**
 * Categorize file type into bucket
 */
function categorizeFileType(fileType) {
    if (!fileType) return null;
    const normalized = normalizeText(fileType);
    
    // Handle common variations - check if any variation matches
    const typeMap = {
        'x_ray': ['x-ray', 'xray', 'x ray', 'x_ray', 'radiograph'],
        'mri_scan': ['mri scan', 'mri_scan', 'mri', 'magnetic resonance'],
        'ct_scan': ['ct scan', 'ct_scan', 'ct', 'cat scan', 'computed tomography'],
        'ultrasound': ['ultrasound', 'ultra sound', 'sonography', 'usg', 'echo'],
        'ecg': ['ecg', 'ekg', 'electrocardiogram', 'electro cardiogram', 'heart test'],
        'eeg': ['eeg', 'electroencephalogram', 'brain wave', 'brainwave'],
        'pet_scan': ['pet scan', 'pet_scan', 'pet', 'positron emission'],
        'blood_test': ['blood test', 'blood_test', 'blood work', 'blood', 'cbc', 'hemogram'],
        'lab_report': ['lab report', 'lab_report', 'laboratory', 'lab test', 'lab work'],
        'pathology_report': ['pathology', 'pathology report', 'histopathology', 'biopsy'],
        'discharge_summary': ['discharge summary', 'discharge', 'discharge note', 'discharge report'],
        'medical_certificate': ['medical certificate', 'medical_certificate', 'certificate', 'med cert', 'fitness certificate'],
        'prescription': ['prescription', 'rx', 'medicines', 'drugs', 'medication'],
        'vaccination_record': ['vaccination', 'vaccine', 'immunization', 'vax record'],
        'operation_notes': ['operation', 'surgery', 'operative', 'surgical notes', 'op notes'],
        'biopsy_report': ['biopsy', 'biopsy report', 'tissue sample'],
        'other': ['other', 'miscellaneous', 'misc']
    };
    
    // Check for matches
    for (const [bucketName, variations] of Object.entries(typeMap)) {
        for (const variation of variations) {
            if (normalized.includes(variation)) {
                return bucketName;
            }
        }
    }
    
    // If no match found, return normalized version with underscores (for custom types)
    return normalized.replace(/[\s-]+/g, '_');
}

/**
 * Categorize symptoms text into bucket(s)
 */
function categorizeSymptoms(symptomsText) {
    const categories = [];
    const normalized = normalizeText(symptomsText);
    
    for (const [category, keywords] of Object.entries(SYMPTOM_CATEGORIES)) {
        if (containsKeywords(normalized, keywords)) {
            categories.push(category);
        }
    }
    
    return categories;
}

/**
 * Categorize body parts text into bucket(s)
 */
function categorizeBodyParts(bodyPartsText) {
    const categories = [];
    const normalized = normalizeText(bodyPartsText);
    
    for (const [category, keywords] of Object.entries(BODY_PART_CATEGORIES)) {
        if (containsKeywords(normalized, keywords)) {
            categories.push(category);
        }
    }
    
    return categories;
}

/**
 * Add block to bucket (creates bucket if doesn't exist)
 */
function addToBucket(bucketCategory, bucketName, blockIndex) {
    if (!buckets[bucketCategory][bucketName]) {
        buckets[bucketCategory][bucketName] = new Set();
    }
    buckets[bucketCategory][bucketName].add(blockIndex);
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

/**
 * Initialize all buckets at server startup
 */
export async function initializeBuckets() {
    if (bucketsInitialized) {
        console.log('⚠️  Buckets already initialized');
        return;
    }
    
    console.log('\n🗂️  INITIALIZING BUCKET SYSTEM...\n');
    const startTime = Date.now();
    
    try {
        // Fetch all records from database
        console.log('📊 Fetching all records from database...');
        const result = await pool.query(`
            SELECT 
                bm.block_index,
                bm.ipfs_cid,
                bm.file_type,
                bm.patient_id,
                bm.doc as doctor_id,
                p.date_of_birth,
                p.gender
            FROM blockchain_metadata bm
            LEFT JOIN patients p ON bm.patient_id = p.patient_id
            WHERE bm.block_index > 0 AND bm.patient_id IS NOT NULL
            ORDER BY bm.block_index ASC
        `);
        
        const records = result.rows;
        totalRecordsProcessed = records.length;
        
        console.log(`   Found ${totalRecordsProcessed} records to process\n`);
        
        if (totalRecordsProcessed === 0) {
            console.log('⚠️  No records found in database\n');
            bucketsInitialized = true;
            return;
        }
        
        // Process records in batches for IPFS data
        const batchSize = 10;
        let processedCount = 0;
        let ipfsErrorCount = 0;
        let ipfsAvailable = true;
        
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            
            // Fetch IPFS data in parallel for this batch
            await Promise.all(batch.map(async (record) => {
                try {
                    let ipfsData = null;
                    
                    // Fetch IPFS data if CID exists and IPFS is available
                    if (record.ipfs_cid && ipfsAvailable) {
                        try {
                            ipfsData = await Promise.race([
                                fetchFromIPFS(record.ipfs_cid, true), // Silent mode
                                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                            ]);
                        } catch (err) {
                            // Count IPFS errors
                            ipfsErrorCount++;
                            
                            // If multiple IPFS errors, assume IPFS is down
                            if (ipfsErrorCount >= 5 && i < 20) {
                                ipfsAvailable = false;
                                console.log('\n   ⚠️  IPFS appears to be unavailable. Continuing without IPFS data...\n');
                            }
                        }
                    }
                    
                    // Track which buckets this record belongs to
                    const recordBuckets = [];
                    
                    // 1. DIAGNOSIS BUCKETS (from IPFS)
                    const diagnosisText = ipfsData?.primary_diagnosis || ipfsData?.Disease || '';
                    const diagnosisCategories = categorizeDiagnosis(diagnosisText);
                    diagnosisCategories.forEach(cat => {
                        addToBucket('diagnosis', cat, record.block_index);
                        recordBuckets.push(`diagnosis:${cat}`);
                    });
                    
                    // 2. FILE TYPE BUCKET (from blockchain_metadata)
                    const fileTypeCat = categorizeFileType(record.file_type);
                    if (fileTypeCat) {
                        addToBucket('fileType', fileTypeCat, record.block_index);
                        recordBuckets.push(`fileType:${fileTypeCat}`);
                    }
                    
                    // 3. SYMPTOM BUCKETS (from IPFS)
                    const symptomsText = Array.isArray(ipfsData?.symptoms) 
                        ? ipfsData.symptoms.join(' ') 
                        : (ipfsData?.symptoms || '');
                    const symptomCategories = categorizeSymptoms(symptomsText);
                    symptomCategories.forEach(cat => {
                        addToBucket('symptom', cat, record.block_index);
                        recordBuckets.push(`symptom:${cat}`);
                    });
                    
                    // 4. BODY PART BUCKETS (from IPFS)
                    const bodyPartsText = Array.isArray(ipfsData?.affected_body_parts)
                        ? ipfsData.affected_body_parts.join(' ')
                        : (ipfsData?.affected_body_parts || '');
                    const bodyPartCategories = categorizeBodyParts(bodyPartsText);
                    bodyPartCategories.forEach(cat => {
                        addToBucket('bodyPart', cat, record.block_index);
                        recordBuckets.push(`bodyPart:${cat}`);
                    });
                    
                    // 5. AGE GROUP BUCKET (from patients table - date_of_birth)
                    const age = calculateAge(record.date_of_birth);
                    const ageGroup = getAgeGroup(age);
                    if (ageGroup) {
                        addToBucket('ageGroup', ageGroup, record.block_index);
                        recordBuckets.push(`ageGroup:${ageGroup}`);
                    }
                    
                    // 6. GENDER BUCKET (from patients table)
                    if (record.gender) {
                        const genderNorm = normalizeText(record.gender);
                        addToBucket('gender', genderNorm, record.block_index);
                        recordBuckets.push(`gender:${genderNorm}`);
                    }
                    
                    // 7. LEFTOVER (if no buckets)
                    if (recordBuckets.length === 0) {
                        buckets.leftover.add(record.block_index);
                    }
                    
                } catch (error) {
                    console.error(`   Error processing record ${record.block_index}:`, error.message);
                }
            }));
            
            processedCount += batch.length;
            if (processedCount % 50 === 0 || processedCount === totalRecordsProcessed) {
                process.stdout.write(`\r   Processing: ${processedCount}/${totalRecordsProcessed} records...`);
            }
        }
        
        console.log('\n');
        
        // Calculate statistics
        const totalBuckets = 
            Object.keys(buckets.diagnosis).length +
            Object.keys(buckets.fileType).length +
            Object.keys(buckets.symptom).length +
            Object.keys(buckets.bodyPart).length +
            Object.keys(buckets.ageGroup).length +
            Object.keys(buckets.gender).length +
            (buckets.leftover.size > 0 ? 1 : 0);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('✅ BUCKET INITIALIZATION COMPLETE\n');
        console.log(`   📊 Total Records: ${totalRecordsProcessed}`);
        console.log(`   🗂️  Total Buckets: ${totalBuckets}`);
        console.log(`   ├─ Diagnosis: ${Object.keys(buckets.diagnosis).length} buckets`);
        console.log(`   ├─ File Types: ${Object.keys(buckets.fileType).length} buckets`);
        console.log(`   ├─ Symptoms: ${Object.keys(buckets.symptom).length} buckets`);
        console.log(`   ├─ Body Parts: ${Object.keys(buckets.bodyPart).length} buckets`);
        console.log(`   ├─ Age Groups: ${Object.keys(buckets.ageGroup).length} buckets`);
        console.log(`   ├─ Gender: ${Object.keys(buckets.gender).length} buckets`);
        console.log(`   └─ Leftover: ${buckets.leftover.size} records`);
        console.log(`   ⏱️  Time: ${elapsedTime}s`);
        
        if (ipfsErrorCount > 0) {
            console.log(`\n   ⚠️  Note: ${ipfsErrorCount} IPFS fetch errors occurred`);
            console.log(`   Diagnosis, Symptoms, and Body Parts buckets may be incomplete`);
            console.log(`   Start IPFS daemon for complete bucket initialization\n`);
        } else {
            console.log('');
        }
        
        bucketsInitialized = true;
        
    } catch (error) {
        console.error('❌ Error initializing buckets:', error);
        throw error;
    }
}

/**
 * Add a new record to appropriate buckets (called after adding new block)
 */
export async function addRecordToBuckets(blockIndex, recordData, ipfsData = null) {
    if (!bucketsInitialized) {
        console.warn('⚠️  Buckets not initialized yet');
        return;
    }
    
    try {
        // 1. Diagnosis (from IPFS)
        const diagnosisText = ipfsData?.primary_diagnosis || ipfsData?.Disease || '';
        const diagnosisCategories = categorizeDiagnosis(diagnosisText);
        diagnosisCategories.forEach(cat => addToBucket('diagnosis', cat, blockIndex));
        
        // 2. File Type (from blockchain_metadata)
        const fileTypeCat = categorizeFileType(recordData.file_type);
        if (fileTypeCat) addToBucket('fileType', fileTypeCat, blockIndex);
        
        // 3. Symptoms (from IPFS)
        const symptomsText = Array.isArray(ipfsData?.symptoms) 
            ? ipfsData.symptoms.join(' ') 
            : (ipfsData?.symptoms || '');
        const symptomCategories = categorizeSymptoms(symptomsText);
        symptomCategories.forEach(cat => addToBucket('symptom', cat, blockIndex));
        
        // 4. Body Parts (from IPFS)
        const bodyPartsText = Array.isArray(ipfsData?.affected_body_parts)
            ? ipfsData.affected_body_parts.join(' ')
            : (ipfsData?.affected_body_parts || '');
        const bodyPartCategories = categorizeBodyParts(bodyPartsText);
        bodyPartCategories.forEach(cat => addToBucket('bodyPart', cat, blockIndex));
        
        // 5. Age Group (from patients table - requires date_of_birth in recordData)
        if (recordData.date_of_birth) {
            const age = calculateAge(recordData.date_of_birth);
            const ageGroup = getAgeGroup(age);
            if (ageGroup) addToBucket('ageGroup', ageGroup, blockIndex);
        }
        
        // 6. Gender (from patients table - requires gender in recordData)
        if (recordData.gender) {
            addToBucket('gender', normalizeText(recordData.gender), blockIndex);
        }
        
        // 7. Leftover
        const hasCategory = diagnosisCategories.length > 0 || fileTypeCat || 
                           symptomCategories.length > 0 || bodyPartCategories.length > 0;
        if (!hasCategory) {
            buckets.leftover.add(blockIndex);
        }
        
    } catch (error) {
        console.error(`Error adding record ${blockIndex} to buckets:`, error);
    }
}

// ============================================================================
// BUCKET ACCESS FUNCTIONS
// ============================================================================

/**
 * Get all buckets
 */
export function getAllBuckets() {
    return buckets;
}

/**
 * Get specific bucket
 */
export function getBucket(category, name) {
    return buckets[category]?.[name] || new Set();
}

/**
 * Get records from multiple buckets
 */
export function getRecordsFromBuckets(bucketList) {
    const recordSet = new Set();
    
    bucketList.forEach(bucket => {
        const [category, name] = bucket.split(':');
        const bucketRecords = getBucket(category, name);
        bucketRecords.forEach(blockIndex => recordSet.add(blockIndex));
    });
    
    return Array.from(recordSet);
}

/**
 * Get bucket statistics
 */
export function getBucketStats() {
    return {
        totalRecords: totalRecordsProcessed,
        initialized: bucketsInitialized,
        bucketCounts: {
            diagnosis: Object.keys(buckets.diagnosis).length,
            fileType: Object.keys(buckets.fileType).length,
            symptom: Object.keys(buckets.symptom).length,
            bodyPart: Object.keys(buckets.bodyPart).length,
            ageGroup: Object.keys(buckets.ageGroup).length,
            gender: Object.keys(buckets.gender).length,
            leftover: buckets.leftover.size
        }
    };
}

/**
 * Check if buckets are initialized
 */
export function areBucketsInitialized() {
    return bucketsInitialized;
}

/**
 * Map search criteria to relevant buckets
 */
export function getRelevantBuckets(searchCriteria) {
    const relevantBuckets = [];
    
    // Map diagnosis
    if (searchCriteria.primary_diagnosis) {
        const categories = categorizeDiagnosis(searchCriteria.primary_diagnosis);
        categories.forEach(cat => relevantBuckets.push(`diagnosis:${cat}`));
    }
    
    // Map file type
    if (searchCriteria.file_type) {
        const cat = categorizeFileType(searchCriteria.file_type);
        if (cat) relevantBuckets.push(`fileType:${cat}`);
    }
    
    // Map symptoms
    if (searchCriteria.symptoms) {
        const categories = categorizeSymptoms(searchCriteria.symptoms);
        categories.forEach(cat => relevantBuckets.push(`symptom:${cat}`));
    }
    
    // Map body parts
    if (searchCriteria.affected_body_parts) {
        const categories = categorizeBodyParts(searchCriteria.affected_body_parts);
        categories.forEach(cat => relevantBuckets.push(`bodyPart:${cat}`));
    }
    
    // Map status
    if (searchCriteria.file_status) {
        relevantBuckets.push(`status:${normalizeText(searchCriteria.file_status)}`);
    }
    
    return relevantBuckets;
}

export default {
    initializeBuckets,
    addRecordToBuckets,
    getAllBuckets,
    getBucket,
    getRecordsFromBuckets,
    getBucketStats,
    areBucketsInitialized,
    getRelevantBuckets
};

export {
    DIAGNOSIS_CATEGORIES,
    FILE_TYPE_CATEGORIES,
    SYMPTOM_CATEGORIES,
    BODY_PART_CATEGORIES,
    AGE_GROUPS
};
