"""
Flask API to expose Blockchain operations
This service handles all blockchain-related operations
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from Blockchain import Blockchain, Block
import json

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin requests from Node.js

# Initialize blockchain
blockchain = Blockchain()

# ===========================================
# API ENDPOINTS
# ===========================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if blockchain API is running"""
    return jsonify({
        'status': 'healthy',
        'message': 'Blockchain API is running',
        'blocks_count': len(blockchain.chain)
    }), 200


@app.route('/api/blockchain', methods=['GET'])
def get_blockchain():
    """Get the entire blockchain"""
    chain_data = [block.to_dict() for block in blockchain.chain]
    return jsonify({
        'chain': chain_data,
        'length': len(chain_data)
    }), 200


@app.route('/api/blockchain/latest', methods=['GET'])
def get_latest_block():
    """Get the latest block"""
    latest = blockchain.get_latest_block()
    if latest:
        return jsonify(latest.to_dict()), 200
    return jsonify({'error': 'No blocks in chain'}), 404


@app.route('/api/blockchain/block/<int:index>', methods=['GET'])
def get_block_by_index(index):
    """Get a specific block by index"""
    if 0 <= index < len(blockchain.chain):
        return jsonify(blockchain.chain[index].to_dict()), 200
    return jsonify({'error': 'Block not found'}), 404


@app.route('/api/blockchain/patient/<patient_id>', methods=['GET'])
def get_patient_blocks(patient_id):
    """Get all blocks for a specific patient"""
    patient_blocks = []
    for block in blockchain.chain:
        if isinstance(block.data, dict) and block.data.get('patient ID') == patient_id:
            patient_blocks.append(block.to_dict())
    
    return jsonify({
        'patient_id': patient_id,
        'blocks': patient_blocks,
        'count': len(patient_blocks)
    }), 200


@app.route('/api/blockchain/add', methods=['POST'])
def add_block():
    """Add a new block to the blockchain"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Add block to blockchain
        blockchain.add_block(data)
        
        # Get the newly added block
        latest_block = blockchain.get_latest_block()
        
        return jsonify({
            'message': 'Block added successfully',
            'block': latest_block.to_dict()
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/blockchain/validate', methods=['GET'])
def validate_blockchain():
    """Validate the integrity of the blockchain"""
    is_valid = True
    errors = []
    
    for i in range(1, len(blockchain.chain)):
        current_block = blockchain.chain[i]
        previous_block = blockchain.chain[i - 1]
        
        # Check if current block's hash is correct
        if current_block.hash != current_block.calculate_hash():
            is_valid = False
            errors.append(f'Block {i} has invalid hash')
        
        # Check if previous_hash matches
        if current_block.previous_hash != previous_block.hash:
            is_valid = False
            errors.append(f'Block {i} has broken chain link')
    
    return jsonify({
        'valid': is_valid,
        'errors': errors if errors else None,
        'message': 'Blockchain is valid' if is_valid else 'Blockchain integrity compromised'
    }), 200


@app.route('/api/blockchain/stats', methods=['GET'])
def get_stats():
    """Get blockchain statistics"""
    total_blocks = len(blockchain.chain)
    
    # Count records by patient
    patient_counts = {}
    for block in blockchain.chain:
        if isinstance(block.data, dict):
            patient_id = block.data.get('patient ID')
            if patient_id:
                patient_counts[patient_id] = patient_counts.get(patient_id, 0) + 1
    
    return jsonify({
        'total_blocks': total_blocks,
        'difficulty': blockchain.difficulty,
        'patients_count': len(patient_counts),
        'records_by_patient': patient_counts,
        'genesis_block': blockchain.chain[0].to_dict() if blockchain.chain else None
    }), 200


# ===========================================
# RUN SERVER
# ===========================================

if __name__ == '__main__':
    print('╔════════════════════════════════════════════════╗')
    print('║   Blockchain API Service                      ║')
    print('║   Flask REST API                               ║')
    print('╚════════════════════════════════════════════════╝')
    print('')
    print('🔗 Blockchain API running on: http://localhost:5000')
    print('📦 Loaded blockchain with', len(blockchain.chain), 'blocks')
    print('')
    print('Available endpoints:')
    print('  GET  /api/health                - Health check')
    print('  GET  /api/blockchain            - Get entire chain')
    print('  GET  /api/blockchain/latest     - Get latest block')
    print('  GET  /api/blockchain/block/<id> - Get specific block')
    print('  GET  /api/blockchain/patient/<id> - Get patient blocks')
    print('  POST /api/blockchain/add        - Add new block')
    print('  GET  /api/blockchain/validate   - Validate chain')
    print('  GET  /api/blockchain/stats      - Get statistics')
    print('')
    print('Press Ctrl+C to stop')
    print('════════════════════════════════════════════════')
    
    app.run(debug=True, port=5000)
