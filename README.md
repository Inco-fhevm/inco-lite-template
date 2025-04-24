# **Inco Lite - Hardhat Template**

This repository provides a **complete Hardhat setup** for testing **reencryption, decryption, and ciphertext formation** in smart contracts.

## **Setup Instructions**

Below, we run a local node and a local covalidator (taken from [the Docker Compose file](./docker-compose.yaml)), and run Hardhat tests against it.

### **1. Clone the Repository**
```sh
git clone <your-repo-url>
cd into_your_repo
```

### **2. Install Dependencies**
```sh
pnpm install
```

### **3. Run a local node**

The current instructions will run a local node and a local covalidator. If you are using this template against another network, e.g. Base Sepolia, skip this step.

```sh
docker compose up
```

### **3. Configure Environment Variables**  

The current instructions work for a local node and a local covalidator. If that is your case, simply copy the environment variables prepared for you:

```
cp .env.local .env
```

If you want to test on another chain, e.g. Base Sepolia, fill in your own information in the `.env` file.

```plaintext
PRIVATE_KEY=""  # Private key funded with native tokens
SEED_PHRASE=""  # Seed phrase for testing with different accounts
BASE_SEPOLIA_RPC_URL=""  # RPC URL supporting eth_getLogs and eth_getFilteredLogs
```

### **4. Compile Smart Contracts**
```sh
pnpm hardhat compile
```

### **5. Run Tests**
```sh
pnpm hardhat test --network lightningRod
```

Or, if running against another network, e.g. Base Sepolia, run

```sh
pnpm hardhat test --network baseSepolia
```

## **Features**
- End-to-end testing of encryption, reencryption  and decryption functionalities.
- Hardhat-based test framework.
- Supports reencryption and ciphertext validation.
