import hashlib
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import time

# Database connection configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'user': 'postgres',
    'password': 'Antrogres_1234',
    'database': 'Medical_project'
}

# --- Blockchain Classes ---

class Block:
    def __init__(self, index, previous_hash, data, timestamp=None, nonce=0, hash=None, 
                 patient_id=None, file_type=None, file_status=None, ipfs_cid=None, doc=None):
        self.index = index
        self.timestamp = timestamp or int(time.time() * 1000)  # milliseconds
        self.data = data  # IPFS CID and metadata
        self.previous_hash = previous_hash
        self.nonce = nonce
        self.hash = hash or self.calculate_hash()
        self.patient_id = patient_id
        self.file_type = file_type
        self.file_status = file_status
        self.ipfs_cid = ipfs_cid
        self.doc = doc

    def calculate_hash(self):
        block_string = f"{self.index}{self.timestamp}{self.data}{self.previous_hash}{self.nonce}"
        return hashlib.sha256(block_string.encode()).hexdigest()

    def mine_block(self, difficulty):
        target = '0' * difficulty
        while self.hash[:difficulty] != target:
            self.nonce += 1
            self.hash = self.calculate_hash()

    def to_dict(self):
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
            "hash": self.hash,
            "patient_id": self.patient_id,
            "file_type": self.file_type,
            "file_status": self.file_status,
            "ipfs_cid": self.ipfs_cid
        }

    @staticmethod
    def from_db_row(row):
        """Create Block from database row"""
        return Block(
            index=row['block_index'],
            previous_hash=row['previous_hash'],
            data=row['ipfs_cid'],  # Use CID as data
            timestamp=row['timestamp'],
            nonce=row['nonce'],
            hash=row['block_hash'],
            patient_id=row.get('patient_id'),
            file_type=row.get('file_type'),
            file_status=row.get('file_status'),
            ipfs_cid=row['ipfs_cid']
        )


class Blockchain:
    def __init__(self):
        self.chain = []
        self.difficulty = 2
        self.conn = None
        self.connect_db()
        self.load_chain()

    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(**DB_CONFIG)
            print("📦 Connected to PostgreSQL database")
        except Exception as e:
            print(f"❌ Database connection error: {e}")
            raise

    def get_db_cursor(self):
        """Get database cursor with auto-reconnect"""
        if self.conn is None or self.conn.closed:
            self.connect_db()
        return self.conn.cursor(cursor_factory=RealDictCursor)

    def create_genesis_block(self):
        """Create genesis block and store in database"""
        genesis = Block(0, "0", "Genesis Block", nonce=0)
        return genesis

    def get_latest_block(self):
        return self.chain[-1] if self.chain else None

    def add_block(self, data, patient_id=None, file_type=None, file_status='Open', ipfs_cid=None, doc=None):
        """Add a new block to blockchain and database"""
        previous_block = self.get_latest_block()
        
        # If no previous block exists, create genesis first
        if previous_block is None:
            genesis = self.create_genesis_block()
            self.save_block_to_db(genesis)
            self.chain.append(genesis)
            previous_block = genesis
        
        # Create new block
        new_block = Block(
            index=len(self.chain),
            previous_hash=previous_block.hash,
            data=ipfs_cid or data,
            patient_id=patient_id,
            file_type=file_type,
            file_status=file_status,
            ipfs_cid=ipfs_cid,
            doc=doc
        )
        
        # Mine the block
        new_block.mine_block(self.difficulty)
        
        # Save to database
        self.save_block_to_db(new_block)
        
        # Add to chain
        self.chain.append(new_block)
        print("✅ Block added to blockchain and database.")
        
        return new_block

    def save_block_to_db(self, block):
        """Save a single block to PostgreSQL"""
        try:
            cursor = self.get_db_cursor()
            
            # Check if block already exists
            cursor.execute(
                "SELECT block_index FROM blockchain_metadata WHERE block_hash = %s",
                (block.hash,)
            )
            
            if cursor.fetchone():
                print(f"⚠️ Block {block.index} already exists in database")
                return
            
            # Insert block
            cursor.execute("""
                INSERT INTO blockchain_metadata 
                (block_hash, previous_hash, timestamp, nonce, ipfs_cid, patient_id, file_type, file_status, doc)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                block.hash,
                block.previous_hash,
                block.timestamp,
                block.nonce,
                block.ipfs_cid or block.data,
                block.patient_id,
                block.file_type,
                block.file_status,
                block.doc
            ))
            
            self.conn.commit()
            cursor.close()
            print(f"💾 Block {block.index} saved to database")
            
        except Exception as e:
            print(f"❌ Error saving block to database: {e}")
            if self.conn:
                self.conn.rollback()
            raise

    def load_chain(self):
        """Load blockchain from PostgreSQL database"""
        try:
            cursor = self.get_db_cursor()
            cursor.execute("""
                SELECT block_index, block_hash, previous_hash, timestamp, 
                       nonce, ipfs_cid, patient_id, file_type, file_status
                FROM blockchain_metadata 
                ORDER BY block_index ASC
            """)
            
            rows = cursor.fetchall()
            cursor.close()
            
            if rows:
                self.chain = [Block.from_db_row(row) for row in rows]
                print(f"📂 Blockchain loaded from database: {len(self.chain)} blocks")
            else:
                print("🔃 No blockchain found in database. Creating genesis block.")
                genesis = self.create_genesis_block()
                self.save_block_to_db(genesis)
                self.chain = [genesis]
                
        except Exception as e:
            print(f"❌ Error loading blockchain: {e}")
            # Create genesis block if database is empty
            genesis = self.create_genesis_block()
            self.save_block_to_db(genesis)
            self.chain = [genesis]

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("🔌 Database connection closed")

