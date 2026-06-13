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

Fill in your own information in the `.env` file, you can take this as example:

```plaintext
# This should be a private key funded with native tokens.
PRIVATE_KEY_ANVIL="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PRIVATE_KEY_BASE_SEPOLIA=""

# This should be a seed phrase used to test functionalities with different accounts.  
# You can send funds from the main wallet to this whenever needed.
SEED_PHRASE="garden cage click scene crystal fat message twice rubber club choice cool"

# This should be an RPC URL provided by a proper provider  
# that supports the eth_getLogs() and eth_getFilteredLogs() methods.
LOCAL_CHAIN_RPC_URL="http://localhost:8545"
BASE_SEPOLIA_RPC_URL="https://base-sepolia-rpc.publicnode.com"
```

### **4. Compile Smart Contracts**
```sh
pnpm hardhat compile
```

### **5. Run Tests**

The e2e tests run under **Bun** (ESM, loads `@inco/lightning-js`'s ESM build). Compile first, then run.

**Base Sepolia (default — hosted covalidator, no docker):** needs a funded `PRIVATE_KEY_BASE_SEPOLIA`.

```sh
pnpm hardhat compile
bun run test             # → Base Sepolia
```

**Local node (anvil + covalidator):** start the docker node, then run with the local flag.

```sh
docker compose up -d
pnpm hardhat compile
bun run test:local       # → local anvil (NETWORK=anvil)
```

> Use `bun run test` / `bun run test:local` (not bare `bun test`) — the scripts set a long
> timeout for the covalidator round-trips; the default 5s will time out. Decrypt waits adaptively
> (retries until the covalidator processes the handle), so it's instant locally and patient on
> Base Sepolia.

## **Features**
- End-to-end testing of encryption, reencryption  and decryption functionalities.
- Hardhat for contracts; Bun + ESM for the encrypt/decrypt e2e (matching `@inco/lightning-js` v1).
- Supports reencryption and ciphertext validation.
