import { createWalletClient, createPublicClient, http , type Address} from "viem";
import { privateKeyToAccount, mnemonicToAccount, generateMnemonic, english } from "viem/accounts";
import { base, baseSepolia, anvil } from "viem/chains";
import * as dotenv from "dotenv";
import { HexString } from "@inco/lightning-js";

dotenv.config();

// Tests run under Bun (ESM), not the Hardhat runtime, so select the network from an env var.
// Default target is Base Sepolia (hosted covalidator, no local docker needed).
//   NETWORK=anvil        → local anvil + covalidator (`bun run test:local`)
//   NETWORK=baseSepolia  → Base Sepolia testnet      (`bun run test` / `test:testnet`)
//   NETWORK=baseMainnet  → Base mainnet (REAL ETH)   (`bun run test:mainnet`)
const networkName = process.env.NETWORK || "baseSepolia";
const USE_ANVIL = networkName === "anvil";
const USE_MAINNET = networkName === "baseMainnet";
console.log(`Detected network: ${networkName}`);

// Choose chain and RPC URL based on network
const chain = USE_ANVIL ? anvil : USE_MAINNET ? base : baseSepolia;
const rpcUrl = USE_ANVIL
  ? process.env.LOCAL_CHAIN_RPC_URL || "http://localhost:8545"
  : USE_MAINNET
  ? process.env.BASE_MAINNET_RPC_URL || "https://base-rpc.publicnode.com"
  : process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com";

// Load and validate PRIVATE_KEY based on selected network
const PRIVATE_KEY_ENV = USE_ANVIL
  ? process.env.PRIVATE_KEY_ANVIL
  : USE_MAINNET
  ? process.env.PRIVATE_KEY_BASE_MAINNET
  : process.env.PRIVATE_KEY_BASE_SEPOLIA;
const PRIVATE_KEY_VAR = USE_ANVIL
  ? "PRIVATE_KEY_ANVIL"
  : USE_MAINNET
  ? "PRIVATE_KEY_BASE_MAINNET"
  : "PRIVATE_KEY_BASE_SEPOLIA";
if (!PRIVATE_KEY_ENV) {
  throw new Error(`Missing ${PRIVATE_KEY_VAR} in .env file`);
}
const PRIVATE_KEY = PRIVATE_KEY_ENV.startsWith("0x")
  ? (PRIVATE_KEY_ENV as HexString)
  : (`0x${PRIVATE_KEY_ENV}` as HexString);
if (PRIVATE_KEY.length !== 66) {
  throw new Error("Invalid private key length in .env file");
}

// Create account from private key
const account = privateKeyToAccount(PRIVATE_KEY);

// Public client (read-only)
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

// Wallet client (signing)
export const wallet = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});


// Generate named wallets from a mnemonic.
// On mainnet (or when RANDOM_WALLETS=1) we generate a FRESH ephemeral mnemonic at runtime instead
// of using the public SEED_PHRASE: those public-phrase addresses are watched by sweeper bots that
// drain any incoming ETH on mainnet, so the funded test wallets would never keep their balance.
// A throwaway mnemonic gives clean, sweep-free addresses for the duration of the run.
const RANDOM_WALLETS = USE_MAINNET || process.env.RANDOM_WALLETS === "1";
const MNEMONIC = RANDOM_WALLETS ? generateMnemonic(english) : process.env.SEED_PHRASE;
if (!MNEMONIC) throw new Error("Missing SEED_PHRASE in .env file");
if (RANDOM_WALLETS) {
  console.log("Using a fresh ephemeral mnemonic for this run (mainnet-safe, not the public phrase).");
  console.log(`   (recovery phrase for this run: "${MNEMONIC}")`);
}

export const namedWallets: Record<string, ReturnType<typeof createWalletClient>> = {
  alice: createWalletClient({
    account: mnemonicToAccount(MNEMONIC, { path: "m/44'/60'/0'/0/0" }),
    chain,
    transport: http(rpcUrl),
  }),
  bob: createWalletClient({
    account: mnemonicToAccount(MNEMONIC, { path: "m/44'/60'/0'/0/1" }),
    chain,
    transport: http(rpcUrl),
  }),
  dave: createWalletClient({
    account: mnemonicToAccount(MNEMONIC, { path: "m/44'/60'/0'/0/2" }),
    chain,
    transport: http(rpcUrl),
  }),
  carol: createWalletClient({
    account: mnemonicToAccount(MNEMONIC, { path: "m/44'/60'/0'/0/3" }),
    chain,
    transport: http(rpcUrl),
  }),
  john: createWalletClient({
    account: mnemonicToAccount(MNEMONIC, { path: "m/44'/60'/0'/0/4" }),
    chain,
    transport: http(rpcUrl),
  }),
};

console.log("Named wallets created:");
Object.entries(namedWallets).forEach(([name, client]) => {
  console.log(`   - ${name}: ${client.account?.address as Address}`);
});
