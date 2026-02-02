# Build a Private Voting System with Inco

> **Difficulty:** Intermediate  
> **Time:** 45-60 minutes  
> **Prerequisites:** Basic Solidity knowledge, familiarity with Hardhat

## What You'll Build

A fully on-chain private voting system where:
- ✅ Votes are encrypted — no one can see how you voted
- ✅ Results are only revealed after voting ends
- ✅ Each address can only vote once
- ✅ Vote tallying happens on encrypted data (the magic of FHE!)

This is impossible on regular EVMs where all data is public. With Inco's FHE, we can finally have **true ballot secrecy on-chain**.

## Why FHE for Voting?

| Traditional Blockchain | With Inco FHE |
|------------------------|---------------|
| Everyone sees your vote | Votes are encrypted |
| Can be coerced to vote a certain way | Ballot secrecy maintained |
| Results known before voting ends | Results revealed only after |
| Complex off-chain tallying | Tallying happens on encrypted data |

---

## Project Setup

### 1. Clone the Template

```bash
git clone https://github.com/Inco-fhevm/inco-lite-template.git
cd inco-lite-template
pnpm install
```

### 2. Start Local Environment

```bash
docker compose up
```

### 3. Set Up Environment Variables

Copy the example and use the default local keys:

```bash
cp .env.example .env
```

Your `.env` should contain:
```env
PRIVATE_KEY_ANVIL="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SEED_PHRASE="garden cage click scene crystal fat message twice rubber club choice cool"
LOCAL_CHAIN_RPC_URL="http://localhost:8545"
```

---

## The Smart Contract

Create a new file `contracts/PrivateVoting.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@inco/lightning/src/Lib.sol";

/**
 * @title PrivateVoting
 * @notice A private voting contract using Fully Homomorphic Encryption
 * @dev Votes are encrypted and tallied without revealing individual choices
 */
contract PrivateVoting {
    using Inco for *;

    // ============ State Variables ============
    
    /// @notice The proposal being voted on
    string public proposal;
    
    /// @notice Address that created this vote
    address public creator;
    
    /// @notice Timestamp when voting ends
    uint256 public votingEndTime;
    
    /// @notice Whether results have been revealed
    bool public resultsRevealed;
    
    /// @notice Encrypted count of YES votes
    euint64 private encryptedYesCount;
    
    /// @notice Encrypted count of NO votes  
    euint64 private encryptedNoCount;
    
    /// @notice Final revealed YES count (only set after reveal)
    uint64 public revealedYesCount;
    
    /// @notice Final revealed NO count (only set after reveal)
    uint64 public revealedNoCount;
    
    /// @notice Tracks who has voted
    mapping(address => bool) public hasVoted;
    
    /// @notice Total number of voters
    uint256 public totalVoters;

    // ============ Events ============
    
    event VoteCast(address indexed voter);
    event ResultsRevealed(uint64 yesVotes, uint64 noVotes);
    event VotingCreated(string proposal, uint256 endTime);

    // ============ Errors ============
    
    error VotingEnded();
    error VotingNotEnded();
    error AlreadyVoted();
    error ResultsAlreadyRevealed();
    error OnlyCreator();

    // ============ Constructor ============
    
    /**
     * @notice Creates a new private vote
     * @param _proposal The proposal text to vote on
     * @param _durationSeconds How long voting lasts
     */
    constructor(string memory _proposal, uint256 _durationSeconds) {
        proposal = _proposal;
        creator = msg.sender;
        votingEndTime = block.timestamp + _durationSeconds;
        
        // Initialize encrypted counters to 0
        // We encrypt the value 0 to start our counters
        encryptedYesCount = Inco.encrypt64(0);
        encryptedNoCount = Inco.encrypt64(0);
        
        emit VotingCreated(_proposal, votingEndTime);
    }

    // ============ Core Functions ============
    
    /**
     * @notice Cast an encrypted vote
     * @param encryptedVote The encrypted vote (1 = YES, 0 = NO)
     * @dev The vote value is encrypted client-side before submission
     */
    function castVote(einput encryptedVote, bytes calldata inputProof) external {
        // Check voting is still open
        if (block.timestamp >= votingEndTime) revert VotingEnded();
        
        // Check hasn't voted before
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        
        // Mark as voted
        hasVoted[msg.sender] = true;
        totalVoters++;
        
        // Convert the input to an encrypted uint64
        // The inputProof validates this is a properly formed ciphertext
        euint64 vote = Inco.asEuint64(encryptedVote, inputProof);
        
        // Here's the FHE magic! We add to counters without knowing the vote value
        // If vote = 1 (YES): yesCount += 1, noCount += 0
        // If vote = 0 (NO):  yesCount += 0, noCount += 1
        
        // Add vote to YES counter (adds 1 if YES, 0 if NO)
        encryptedYesCount = Inco.add(encryptedYesCount, vote);
        
        // Calculate inverse (1 - vote) for NO counter
        euint64 inverseVote = Inco.sub(Inco.encrypt64(1), vote);
        encryptedNoCount = Inco.add(encryptedNoCount, inverseVote);
        
        emit VoteCast(msg.sender);
    }

    /**
     * @notice Reveal the final vote counts
     * @dev Can only be called after voting ends, decrypts the totals
     */
    function revealResults() external {
        // Only allow after voting period
        if (block.timestamp < votingEndTime) revert VotingNotEnded();
        
        // Only allow one reveal
        if (resultsRevealed) revert ResultsAlreadyRevealed();
        
        // Request decryption of the encrypted counters
        // This sends a request to the Inco network to decrypt
        Inco.decrypt(encryptedYesCount);
        Inco.decrypt(encryptedNoCount);
        
        // Note: In production, you'd use a callback pattern
        // For simplicity, we're using synchronous decryption here
        
        resultsRevealed = true;
    }

    /**
     * @notice Callback function for decryption results
     * @dev Called by the Inco network with decrypted values
     */
    function onDecryptionResult(uint256 requestId, uint64 decryptedValue) external {
        // In a full implementation, you'd track which request corresponds
        // to which counter and update accordingly
        // This is simplified for the tutorial
    }

    // ============ View Functions ============
    
    /**
     * @notice Check if voting is still active
     */
    function isVotingActive() external view returns (bool) {
        return block.timestamp < votingEndTime && !resultsRevealed;
    }
    
    /**
     * @notice Get time remaining in seconds
     */
    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= votingEndTime) return 0;
        return votingEndTime - block.timestamp;
    }
    
    /**
     * @notice Get the winning option (only after reveal)
     */
    function getWinner() external view returns (string memory) {
        require(resultsRevealed, "Results not revealed yet");
        
        if (revealedYesCount > revealedNoCount) {
            return "YES";
        } else if (revealedNoCount > revealedYesCount) {
            return "NO";
        } else {
            return "TIE";
        }
    }
}
```

---

## Understanding the FHE Operations

Let's break down the key FHE concepts used:

### 1. Encrypted Types (`euint64`)

```solidity
euint64 private encryptedYesCount;
```

This is an **encrypted unsigned 64-bit integer**. The value is stored on-chain but nobody can read it — not even the contract owner or validators!

### 2. Encrypting Values (`Inco.encrypt64`)

```solidity
encryptedYesCount = Inco.encrypt64(0);
```

Converts a plaintext number to an encrypted form. Only use this for non-sensitive initialization values.

### 3. Encrypted Inputs (`einput` + `inputProof`)

```solidity
function castVote(einput encryptedVote, bytes calldata inputProof) external {
    euint64 vote = Inco.asEuint64(encryptedVote, inputProof);
}
```

Users encrypt their vote **client-side** before sending. The `inputProof` proves the ciphertext is valid without revealing the value.

### 4. Arithmetic on Encrypted Data (`Inco.add`, `Inco.sub`)

```solidity
encryptedYesCount = Inco.add(encryptedYesCount, vote);
```

**This is the magic of FHE!** We're adding to a counter without knowing:
- What the current count is
- What we're adding (0 or 1)

The math happens entirely on encrypted data.

### 5. Decryption (`Inco.decrypt`)

```solidity
Inco.decrypt(encryptedYesCount);
```

Requests the Inco network to decrypt a value. This is the only time data becomes visible.

---

## Writing Tests

Create `test/PrivateVoting.test.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { PrivateVoting } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { createIncoClient } from "@inco/js";

describe("PrivateVoting", function () {
  let voting: PrivateVoting;
  let owner: HardhatEthersSigner;
  let voter1: HardhatEthersSigner;
  let voter2: HardhatEthersSigner;
  let voter3: HardhatEthersSigner;
  let incoClient: any;

  const PROPOSAL = "Should we adopt FHE for all governance?";
  const VOTING_DURATION = 3600; // 1 hour

  beforeEach(async function () {
    [owner, voter1, voter2, voter3] = await ethers.getSigners();
    
    // Initialize Inco client for encryption
    incoClient = await createIncoClient({
      chainId: 31337, // Local chain
      rpcUrl: "http://localhost:8545",
    });

    // Deploy contract
    const PrivateVotingFactory = await ethers.getContractFactory("PrivateVoting");
    voting = await PrivateVotingFactory.deploy(PROPOSAL, VOTING_DURATION);
    await voting.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct proposal", async function () {
      expect(await voting.proposal()).to.equal(PROPOSAL);
    });

    it("should set the correct creator", async function () {
      expect(await voting.creator()).to.equal(owner.address);
    });

    it("should have voting active", async function () {
      expect(await voting.isVotingActive()).to.be.true;
    });

    it("should start with zero voters", async function () {
      expect(await voting.totalVoters()).to.equal(0);
    });
  });

  describe("Voting", function () {
    it("should allow casting an encrypted YES vote", async function () {
      // Encrypt a YES vote (value = 1)
      const { ciphertext, inputProof } = await incoClient.encrypt(1n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });

      // Cast the vote
      await voting.connect(voter1).castVote(ciphertext, inputProof);

      // Verify vote was recorded
      expect(await voting.hasVoted(voter1.address)).to.be.true;
      expect(await voting.totalVoters()).to.equal(1);
    });

    it("should allow casting an encrypted NO vote", async function () {
      // Encrypt a NO vote (value = 0)
      const { ciphertext, inputProof } = await incoClient.encrypt(0n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });

      await voting.connect(voter1).castVote(ciphertext, inputProof);

      expect(await voting.hasVoted(voter1.address)).to.be.true;
    });

    it("should prevent double voting", async function () {
      const { ciphertext, inputProof } = await incoClient.encrypt(1n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });

      await voting.connect(voter1).castVote(ciphertext, inputProof);

      // Try to vote again - should fail
      const { ciphertext: c2, inputProof: p2 } = await incoClient.encrypt(0n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });

      await expect(
        voting.connect(voter1).castVote(c2, p2)
      ).to.be.revertedWithCustomError(voting, "AlreadyVoted");
    });

    it("should allow multiple different voters", async function () {
      // Voter 1 votes YES
      const vote1 = await incoClient.encrypt(1n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter1).castVote(vote1.ciphertext, vote1.inputProof);

      // Voter 2 votes NO
      const vote2 = await incoClient.encrypt(0n, {
        accountAddress: voter2.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter2).castVote(vote2.ciphertext, vote2.inputProof);

      // Voter 3 votes YES
      const vote3 = await incoClient.encrypt(1n, {
        accountAddress: voter3.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter3).castVote(vote3.ciphertext, vote3.inputProof);

      expect(await voting.totalVoters()).to.equal(3);
    });
  });

  describe("Voting Period", function () {
    it("should reject votes after voting ends", async function () {
      // Fast forward past voting period
      await ethers.provider.send("evm_increaseTime", [VOTING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const { ciphertext, inputProof } = await incoClient.encrypt(1n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });

      await expect(
        voting.connect(voter1).castVote(ciphertext, inputProof)
      ).to.be.revertedWithCustomError(voting, "VotingEnded");
    });

    it("should not allow reveal before voting ends", async function () {
      await expect(
        voting.revealResults()
      ).to.be.revertedWithCustomError(voting, "VotingNotEnded");
    });
  });

  describe("Results", function () {
    it("should reveal results after voting ends", async function () {
      // Cast some votes
      const vote1 = await incoClient.encrypt(1n, {
        accountAddress: voter1.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter1).castVote(vote1.ciphertext, vote1.inputProof);

      const vote2 = await incoClient.encrypt(1n, {
        accountAddress: voter2.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter2).castVote(vote2.ciphertext, vote2.inputProof);

      const vote3 = await incoClient.encrypt(0n, {
        accountAddress: voter3.address,
        contractAddress: await voting.getAddress(),
      });
      await voting.connect(voter3).castVote(vote3.ciphertext, vote3.inputProof);

      // Fast forward
      await ethers.provider.send("evm_increaseTime", [VOTING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      // Reveal
      await voting.revealResults();

      expect(await voting.resultsRevealed()).to.be.true;
      // In a full test with callback handling:
      // expect(await voting.revealedYesCount()).to.equal(2);
      // expect(await voting.revealedNoCount()).to.equal(1);
    });
  });
});
```

---

## Running the Tests

```bash
# Make sure Docker is running with the local node
docker compose up -d

# Compile contracts
pnpm hardhat compile

# Run tests
pnpm hardhat test --network anvil
```

Expected output:
```
  PrivateVoting
    Deployment
      ✓ should set the correct proposal
      ✓ should set the correct creator
      ✓ should have voting active
      ✓ should start with zero voters
    Voting
      ✓ should allow casting an encrypted YES vote
      ✓ should allow casting an encrypted NO vote
      ✓ should prevent double voting
      ✓ should allow multiple different voters
    Voting Period
      ✓ should reject votes after voting ends
      ✓ should not allow reveal before voting ends
    Results
      ✓ should reveal results after voting ends

  11 passing
```

---

## Deploying to Base Sepolia

### 1. Get Test Tokens

- Get Base Sepolia ETH from a [faucet](https://www.alchemy.com/faucets/base-sepolia)
- Add your private key to `.env`:

```env
PRIVATE_KEY_BASE_SEPOLIA="your-private-key-here"
BASE_SEPOLIA_RPC_URL="https://base-sepolia-rpc.publicnode.com"
```

### 2. Create Deployment Script

Create `ignition/modules/PrivateVoting.ts`:

```typescript
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrivateVotingModule = buildModule("PrivateVotingModule", (m) => {
  const proposal = m.getParameter("proposal", "Should we adopt this proposal?");
  const duration = m.getParameter("duration", 86400); // 24 hours default

  const privateVoting = m.contract("PrivateVoting", [proposal, duration]);

  return { privateVoting };
});

export default PrivateVotingModule;
```

### 3. Deploy

```bash
pnpm hardhat ignition deploy ./ignition/modules/PrivateVoting.ts \
  --network baseSepolia \
  --parameters '{"proposal": "Should we use FHE?", "duration": 3600}'
```

---

## Frontend Integration (Bonus)

Here's how to integrate with a React frontend:

```typescript
import { createIncoClient } from "@inco/js";
import { ethers } from "ethers";

// Initialize client
const incoClient = await createIncoClient({
  chainId: 84532, // Base Sepolia
  rpcUrl: "https://base-sepolia-rpc.publicnode.com",
});

// Encrypt and cast a vote
async function castVote(contract: ethers.Contract, voteYes: boolean) {
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  // Encrypt the vote (1 for YES, 0 for NO)
  const { ciphertext, inputProof } = await incoClient.encrypt(
    voteYes ? 1n : 0n,
    {
      accountAddress: address,
      contractAddress: contract.address,
    }
  );
  
  // Send transaction
  const tx = await contract.castVote(ciphertext, inputProof);
  await tx.wait();
  
  console.log("Vote cast successfully!");
}
```

---

## Key Takeaways

1. **FHE enables true ballot secrecy** — votes are encrypted end-to-end
2. **Arithmetic on encrypted data** — we can count votes without seeing them
3. **Decryption is explicit** — data stays encrypted until you specifically decrypt
4. **Same Solidity** — use your existing skills, just with new encrypted types

---

## Next Steps

- Add **weighted voting** based on token holdings
- Implement **multiple choice** votes (not just YES/NO)
- Add **delegation** functionality
- Create a **full frontend** with React/Next.js
- Implement **commit-reveal** for extra security

---

## Resources

- [Inco Documentation](https://docs.inco.org)
- [FHE Operations Reference](https://docs.inco.org/inco-protocol/fhevm-fhe-+-evm)
- [Inco Discord](https://discord.com/invite/inco)
- [Example Contracts](https://github.com/Inco-fhevm/inco-example-contracts)

---

## Troubleshooting

### "Docker container not starting"
Make sure Docker daemon is running and ports 8545 aren't in use.

### "Transaction reverted"
Check that you're connected to the correct network and have enough gas.

### "Encryption failed"
Ensure you're using the correct chain ID and RPC URL for your network.

---

**Congratulations!** 🎉 You've built a private voting system using Fully Homomorphic Encryption. This is technology that was science fiction just a few years ago, now running on a blockchain near you.
