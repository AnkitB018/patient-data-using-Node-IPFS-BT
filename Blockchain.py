import hashlib
import json
import os
from datetime import datetime

# --- Blockchain Classes ---

class Block:
    def __init__(self, index, previous_hash, data, timestamp=None, nonce=0, hash=None):
        self.index = index
        self.timestamp = timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.data = data  # now just CID and metadata
        self.previous_hash = previous_hash
        self.nonce = nonce
        self.hash = hash or self.calculate_hash()

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
            "hash": self.hash
        }

    @staticmethod
    def from_dict(data):
        return Block(
            index=data["index"],
            timestamp=data["timestamp"],
            data=data["data"],
            previous_hash=data["previous_hash"],
            nonce=data["nonce"],
            hash=data["hash"]
        )


class Blockchain:
    def __init__(self):
        self.chain = []
        self.difficulty = 2
        self.load_chain()

    def create_genesis_block(self):
        return Block(0, "0", "Genesis Block")

    def get_latest_block(self):
        return self.chain[-1] if self.chain else None

    def add_block(self, data):
        previous_block = self.get_latest_block() or self.create_genesis_block()
        new_block = Block(index=len(self.chain),
                          previous_hash=previous_block.hash,
                          data=data)
        new_block.mine_block(self.difficulty)
        self.chain.append(new_block)
        self.save_chain()
        print("✅ Block added to blockchain.")

    def save_chain(self):
        with open("blockchain.json", "w") as f:
            json.dump([block.to_dict() for block in self.chain], f, indent=4)

    def load_chain(self):
        try:
            with open("blockchain.json", "r") as f:
                data = json.load(f)
                self.chain = [Block.from_dict(block) for block in data]
                print("📂 Blockchain loaded.")
        except FileNotFoundError:
            print("🔃 No blockchain found. Creating new one.")
            self.chain = [self.create_genesis_block()]
            self.save_chain()

