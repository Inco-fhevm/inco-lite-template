# Inco Lite - Hardhat Template

<p align="center">
  <img src="https://www.inco.org/inco-logo.svg" alt="Inco Logo" width="200"/>
</p>

<p align="center">
  <strong>Build confidential smart contracts with Fully Homomorphic Encryption</strong>
</p>

<p align="center">
  <a href="https://docs.inco.org">Documentation</a> •
  <a href="https://discord.com/invite/inco">Discord</a> •
  <a href="https://twitter.com/inconetwork">Twitter</a>
</p>

---

## What is This?

This is a **Hardhat template** for building and testing confidential smart contracts using [Inco's FHE (Fully Homomorphic Encryption)](https://www.inco.org) technology.

With this template, you can:
- ✅ Write smart contracts with **encrypted state variables**
- ✅ Perform **computations on encrypted data** without decryption
- ✅ Test **reencryption, decryption, and ciphertext validation**
- ✅ Deploy to **local testnet** or **Base Sepolia**

## Why FHE?

| Traditional Smart Contracts | With Inco FHE |
|-----------------------------|---------------|
| All data is public on-chain | Data is encrypted on-chain |
| Anyone can read balances | Only authorized parties can view |
| No ballot secrecy for voting | True private voting possible |
| MEV bots can front-run | Transactions are confidential |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ 
- [pnpm](https://pnpm.io/) package manager
- [Docker](https://www.docker.com/) for local testing

### 1. Clone & Install

```bash
git clone https://github.com/Inco-fhevm/inco-lite-template.git
cd inco-lite-template
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Default `.env` for local development:
```env
PRIVATE_KEY_ANVIL="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SEED_PHRASE="garden cage click scene crystal fat message twice rubber club choice cool"
LOCAL_CHAIN_RPC_URL="http://localhost:8545"
BASE_SEPOLIA_RPC_URL="https://base-sepolia-rpc.publicnode.com"
```

### 3. Start Local Node

```bash
docker compose up
```

This starts a local Anvil node + Inco covalidator.

### 4. Compile & Test

```bash
# Compile contracts
pnpm hardhat compile

# Run tests against local node
pnpm hardhat test --network anvil
```

---

## Project Structure

```
inco-lite-template/
├── contracts/              # Your Solidity contracts
│   └── ConfidentialToken.sol
├── test/                   # Test files
│   └── ConfidentialToken.test.ts
├── ignition/modules/       # Deployment scripts
├── utils/                  # Helper utilities
├── docker-compose.yaml     # Local node configuration
├── hardhat.config.ts       # Hardhat configuration
└── .env.example            # Environment template
```

---

## FHE Basics

### Encrypted Types

Inco provides encrypted integer types:

| Type | Description |
|------|-------------|
| `ebool` | Encrypted boolean |
| `euint8` | Encrypted 8-bit unsigned integer |
| `euint16` | Encrypted 16-bit unsigned integer |
| `euint32` | Encrypted 32-bit unsigned integer |
| `euint64` | Encrypted 64-bit unsigned integer |
| `eaddress` | Encrypted address |

### Basic Operations

```solidity
import "@inco/lightning/src/Lib.sol";

contract Example {
    using Inco for *;
    
    euint64 private secretBalance;
    
    function deposit(einput encryptedAmount, bytes calldata proof) external {
        // Convert input to encrypted type
        euint64 amount = Inco.asEuint64(encryptedAmount, proof);
        
        // Add encrypted values (FHE magic!)
        secretBalance = Inco.add(secretBalance, amount);
    }
    
    function isAboveThreshold() external view returns (ebool) {
        // Compare encrypted values
        return Inco.gt(secretBalance, Inco.encrypt64(100));
    }
}
```

### Available Operations

| Category | Operations |
|----------|------------|
| **Arithmetic** | `add`, `sub`, `mul`, `div`, `rem` |
| **Comparison** | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` |
| **Bitwise** | `and`, `or`, `xor`, `not`, `shl`, `shr` |
| **Conditional** | `select` (ternary on encrypted condition) |
| **Min/Max** | `min`, `max` |

---

## Deploying to Base Sepolia

### 1. Get Test ETH

Get Base Sepolia ETH from [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia) or [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia).

### 2. Add Your Private Key

Update `.env`:
```env
PRIVATE_KEY_BASE_SEPOLIA="your-private-key-here"
```

### 3. Deploy

```bash
pnpm hardhat ignition deploy ./ignition/modules/ConfidentialToken.ts --network baseSepolia
```

### 4. Run Tests on Testnet

```bash
pnpm hardhat test --network baseSepolia
```

---

## Example Use Cases

| Use Case | Description |
|----------|-------------|
| **Private Voting** | Ballots are encrypted, tallied without revealing individual votes |
| **Confidential Tokens** | Balances and transfer amounts are hidden |
| **Sealed-Bid Auctions** | Bids are encrypted until auction ends |
| **Private Gaming** | Hidden cards, fog of war, secret strategies |
| **Confidential DeFi** | Dark pools, private order books |

---

## Tutorials

- [Build a Confidential Token](https://docs.inco.org/tutorials/confidential-token/hardhat)
- [Private Voting System](./tutorials/TUTORIAL_PRIVATE_VOTING.md) *(coming soon)*
- [Sealed-Bid Auction](./tutorials/TUTORIAL_AUCTION.md) *(coming soon)*

---

## Troubleshooting

### Docker container won't start

```bash
# Check if ports are in use
lsof -i :8545

# Stop conflicting processes or use different port
docker compose down
docker compose up
```

### "Cannot find module '@inco/lightning'"

```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Tests timing out

The FHE operations require the covalidator. Make sure Docker is running:
```bash
docker compose ps  # Should show services running
```

### "Invalid ciphertext" error

Ensure you're encrypting with the correct:
- Chain ID
- Contract address  
- Account address

---

## Resources

| Resource | Link |
|----------|------|
| 📚 Documentation | [docs.inco.org](https://docs.inco.org) |
| 💬 Discord | [discord.com/invite/inco](https://discord.com/invite/inco) |
| 🐦 Twitter | [@inconetwork](https://twitter.com/inconetwork) |
| 📝 Blog | [inco.org/blog](https://www.inco.org/blog) |
| 🧪 Example Contracts | [github.com/Inco-fhevm](https://github.com/Inco-fhevm) |

---

## Contributing

Contributions are welcome! Please:

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ by <a href="https://www.inco.org">Inco Network</a>
</p>
