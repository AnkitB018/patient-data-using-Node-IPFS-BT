# Medical Records Management System
## Blockchain + IPFS

A decentralized patient record management system using blockchain technology and IPFS for secure, immutable medical data storage.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8+
- IPFS Desktop or CLI

### Installation

1. **Install Node.js dependencies:**
   ```powershell
   npm install
   ```

2. **Install Python dependencies:**
   ```powershell
   pip install flask flask-cors
   ```

3. **Start IPFS:**
   - Open IPFS Desktop, or
   - Run in terminal: `ipfs daemon`

4. **Start Blockchain API (Terminal 1):**
   ```powershell
   python flask_blockchain_api.py
   ```

5. **Start Web Server (Terminal 2):**
   ```powershell
   npm start
   ```

6. **Open browser:**
   ```
   http://localhost:3000
   ```

---

## 📁 Project Structure

```
├── server.js                 # Express web server
├── flask_blockchain_api.py   # Blockchain REST API
├── Blockchain.py             # Blockchain implementation
├── routes/                   # Express routes
├── views/                    # EJS templates
├── utils/                    # Helper functions
├── public/                   # Static assets
├── users.json                # User database (temporary)
└── blockchain.json           # Blockchain data
```

---

## 🎯 Features

✅ User authentication (admin & patient roles)  
✅ Upload medical records to IPFS  
✅ Store metadata on blockchain  
✅ View patient records  
✅ Blockchain visualization  
✅ Patient profile management  

---

## 🔮 Coming Soon

🔄 PostgreSQL database  
🔄 GA-based access control  
🔄 Smart contracts  
🔄 Multi-signature approvals  
🔄 Advanced search & filtering  

---

## 📝 License

MIT License
