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

The e2e tests run under **Bun** (ESM), which loads `@inco/js`'s ESM build. Compile first so the
artifacts exist, then run:

```sh
pnpm hardhat compile     # build artifacts
bun run test             # encrypt -> contract -> attestedDecrypt e2e (uses --timeout 300000)
```

> Use `bun run test` (not bare `bun test`) — the script sets a long timeout for the covalidator
> round-trips; the default 5s will time out.
>
> **Apple Silicon note:** the local-node images are amd64-only and run under emulation. Make sure
> Docker Desktop's VM is in a clean state — pick a VMM (QEMU or Apple Virtualization framework)
> and fully **Apply & Restart** after any change. With a consistent VM, decrypt works.

To target Base Sepolia instead of the local node, set `NETWORK=baseSepolia` (with a funded
`PRIVATE_KEY_BASE_SEPOLIA`):

```sh
NETWORK=baseSepolia bun run test
```

## **Features**
- End-to-end testing of encryption, reencryption  and decryption functionalities.
- Hardhat for contracts; Bun + ESM for the encrypt/decrypt e2e (matching `@inco/js` v1).
- Supports reencryption and ciphertext validation.
