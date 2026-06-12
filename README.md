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
bun test                 # encrypt -> contract -> attestedDecrypt e2e
```

> **Apple Silicon (M-series) note.** The published `inconetwork/local-node-covalidator-*`
> images are **amd64-only**, and their post-quantum (X-Wing / ML-KEM) crypto computes
> incorrectly under amd64 emulation on arm64 — so `attestedDecrypt` fails with `invalid tag`.
> Build a **native arm64** covalidator once (requires `gh` access to the inco-monorepo),
> then point the `covalidator` service in `docker-compose.yaml` at it:
>
> ```sh
> ./scripts/build-local-covalidator.sh        # builds inco-covalidator-mainnet:arm64
> # then in docker-compose.yaml set:  image: inco-covalidator-mainnet:arm64
> # and remove that service's `platform: linux/amd64` line
> ```
>
> On native amd64 (Linux / CI / Intel Mac) you don't need this — the default published
> `inconetwork/local-node-covalidator-mainnet` image works as-is.

To target Base Sepolia instead of the local node, set `NETWORK=baseSepolia` (with a funded
`PRIVATE_KEY_BASE_SEPOLIA`):

```sh
NETWORK=baseSepolia bun test
```

## **Features**
- End-to-end testing of encryption, reencryption  and decryption functionalities.
- Hardhat for contracts; Bun + ESM for the encrypt/decrypt e2e (matching `@inco/js` v1).
- Supports reencryption and ciphertext validation.
