// CommonJS config: the package is ESM ("type": "module"), and Hardhat 2 loads its
// config via require(), so the config must be CommonJS.
require("@nomicfoundation/hardhat-toolbox-viem");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY_BASE_SEPOLIA || "";
const PRIVATE_KEY_ANVIL = process.env.PRIVATE_KEY_ANVIL || "";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "";

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    // Inco's local node (anvil + covalidator) — see docker-compose.yaml
    anvil: {
      url: "http://localhost:8545",
      accounts: PRIVATE_KEY_ANVIL ? [PRIVATE_KEY_ANVIL] : [],
      chainId: 31337,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
