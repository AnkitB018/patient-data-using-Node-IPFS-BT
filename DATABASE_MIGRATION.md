# Database Migration Summary

## ✅ **Completed Changes**

### **1. Database Helper Created** (`utils/dbHelper.js`)
- PostgreSQL connection pool
- User operations (get, create, update)
- Blockchain operations (get all blocks, get patient blocks, add block, stats)
- Replaces JSON file operations

### **2. Authentication Updated** (`routes/auth.js`)
- Uses PostgreSQL for user login/registration
- Admin hardcoded: username="admin", password="admin" (for testing)
- Patient registration stores data in `patients` table

### **3. Admin Routes Updated** (`routes/admin.js`)
- Dashboard uses database for patients and stats
- Upload functionality changed:
  - **IPFS stores**: filename, file_base64, patient_name, file_type, disease, file_status, doctor, uploaded_by, description, timestamp
  - **Database stores**: block_index (auto), block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status
- All API endpoints use database queries
- Block hashing done in Node.js (simple SHA-256)

### **4. Patient Routes Updated** (`routes/patient.js`)
- Dashboard fetches patient data from database
- Profile update uses database
- Patient records fetched from database blockchain_metadata table

## 📦 **Data Storage Architecture**

### **PostgreSQL Database**:
1. **patients** table - All patient information
2. **doctors** table - All doctor information  
3. **blockchain_metadata** table - Minimal blockchain data:
   - block_index, block_hash, previous_hash
   - timestamp, nonce
   - ipfs_cid (link to IPFS)
   - patient_id, file_type, file_status

4. **consent_records** table - Patient consent management

### **IPFS Storage** (Complete medical record):
```json
{
  "filename": "xray_chest.pdf",
  "file_base64": "data:application/pdf;base64,...",
  "patient_id": "P001",
  "patient_name": "John Doe",
  "file_type": "X-ray",
  "disease": "Pneumonia",
  "file_status": "Open",
  "doctor": "Dr. Smith",
  "uploaded_by": "admin",
  "description": "Chest X-ray showing pneumonia",
  "timestamp": "12/18/2025, 10:30:00 AM"
}
```

## 🔄 **What Changed**

**Before:**
- users.json → User data
- blockchain.json → All blockchain data
- Python Flask API → Blockchain operations

**After:**
- PostgreSQL `patients` table → User data
- PostgreSQL `blockchain_metadata` → Minimal blockchain metadata
- IPFS → Complete records + files
- Node.js → Direct blockchain operations (no Python dependency for basic ops)

## 🎯 **Benefits**

1. **Database queries** - Fast patient/record lookups
2. **IPFS for files** - Distributed, immutable storage
3. **Minimal blockchain data** - Only essentials in DB, full data in IPFS
4. **Scalable** - PostgreSQL handles millions of records efficiently

## ⚠️ **Notes**

- Python blockchain.py still exists but isn't used for basic operations
- Can be used later for advanced blockchain validation
- Block hashing is simplified (no proof-of-work for now)
- Admin access: username="admin", password="admin" (testing only)
