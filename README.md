# Medical Records System
Blockchain + IPFS based medical records management

## Requirements
- Node.js v16+
- Python 3.8+
- PostgreSQL 13+
- IPFS daemon

## Setup

1. Install dependencies:
```bash
npm install
pip install flask flask-cors
```

2. Configure PostgreSQL:
- Create database: `Medical_project`
- Import schema from `DB_backup/Medical_project.sql`
- Update credentials in `utils/dbHelper.js`

3. Start services:
```bash
# Terminal 1 - IPFS
ipfs daemon

# Terminal 2 - Blockchain API
python flask_blockchain_api.py

# Terminal 3 - Web Server
npm start
```

4. Access: `http://localhost:3000`

## Features
- Secure medical record storage using IPFS
- Blockchain metadata verification
- Multi-role access (Admin, Doctor, Patient)
- Genetic Algorithm based record search
- Doctor-patient consent management
- Record analytics and visualization

## Project Structure
```
routes/          - API endpoints
views/           - Frontend templates
utils/           - Helper functions (DB, IPFS, GA, Blockchain)
public/          - Static assets
Blockchain.py    - Blockchain implementation
```

## Login Credentials
Check database for test accounts or register new users.

## Notes
- Requires active IPFS daemon for file operations
- Blockchain API must run before web server
- PostgreSQL connection required for all features
