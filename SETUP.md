# IPFS + Blockchain Medical Records System

## Project Structure

```
├── server.js                 # Main Express server
├── flask_blockchain_api.py   # Flask API for blockchain operations
├── Blockchain.py             # Blockchain implementation
├── package.json              # Node.js dependencies
├── requirements.txt          # Python dependencies
├── .env                      # Environment variables
│
├── routes/                   # Express route handlers
│   ├── auth.js              # Login, register, logout
│   ├── admin.js             # Admin dashboard & operations
│   └── patient.js           # Patient dashboard & profile
│
├── views/                    # EJS templates
│   ├── login.ejs
│   ├── register.ejs
│   ├── error.ejs
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── upload.ejs
│   │   └── blockchain.ejs
│   └── patient/
│       ├── dashboard.ejs
│       └── profile.ejs
│
├── utils/                    # Helper functions
│   ├── fileHelper.js        # JSON file operations
│   ├── ipfsHelper.js        # IPFS operations
│   └── blockchainHelper.js  # Blockchain API calls
│
├── public/                   # Static files
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
│
├── users.json                # User database (temporary)
└── blockchain.json           # Blockchain storage
```

## Setup Instructions

### 1. Install Dependencies

**Node.js dependencies:**
```bash
npm install
```

**Python dependencies:**
```bash
pip install -r requirements.txt
```

### 2. Start IPFS Daemon

Make sure IPFS is running:
```bash
ipfs daemon
```

### 3. Start Blockchain API (Flask)

In one terminal:
```bash
python flask_blockchain_api.py
```

This starts the blockchain API on `http://localhost:5000`

### 4. Start Node.js Server

In another terminal:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

This starts the web server on `http://localhost:3000`

### 5. Access the Application

Open your browser and go to:
```
http://localhost:3000
```

## Default Users

Check `users.json` for existing users or register a new account.

## Architecture

1. **Frontend**: EJS templates with Bootstrap 5
2. **Backend**: Node.js with Express
3. **Blockchain**: Python Flask API
4. **Storage**: 
   - User data: `users.json`
   - Blockchain: `blockchain.json`
   - Files: IPFS

## API Endpoints

### Blockchain API (Flask - Port 5000)

- `GET /api/health` - Health check
- `GET /api/blockchain` - Get entire blockchain
- `GET /api/blockchain/patient/:id` - Get patient blocks
- `POST /api/blockchain/add` - Add new block
- `GET /api/blockchain/validate` - Validate chain
- `GET /api/blockchain/stats` - Get statistics

### Web Application (Express - Port 3000)

- `GET /` - Login page
- `POST /login` - Login handler
- `GET /register` - Registration page
- `POST /register` - Registration handler
- `GET /logout` - Logout
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/upload` - Upload page
- `POST /admin/upload` - Upload handler
- `GET /admin/blockchain` - View blockchain
- `GET /patient/dashboard` - Patient dashboard
- `GET /patient/profile` - Patient profile

## Next Steps

1. ✅ Convert Python/Dash to Node.js/Express - DONE
2. 🔄 Setup PostgreSQL database
3. 🔄 Implement GA-based access control
4. 🔄 Add smart contracts
5. 🔄 Enhance IPFS integration

## Notes

- Currently using JSON files for storage (will migrate to PostgreSQL)
- No role-based access control yet (coming soon)
- Genetic Algorithm not implemented yet (future feature)
- Smart contracts not implemented yet (future feature)
