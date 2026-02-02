# Inco FHE Cheatsheet

> Quick reference for Fully Homomorphic Encryption operations in Solidity

## Setup

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@inco/lightning/src/Lib.sol";

contract MyContract {
    using Inco for *;
    
    // Your code here
}
```

---

## Encrypted Types

| Type | Bits | Use Case |
|------|------|----------|
| `ebool` | 1 | Flags, conditions |
| `euint8` | 8 | Small counters, enums |
| `euint16` | 16 | Medium values |
| `euint32` | 32 | Timestamps, IDs |
| `euint64` | 64 | Balances, amounts |
| `eaddress` | 160 | Hidden addresses |
| `ebytes256` | 256 | Hashes, large data |

---

## Creating Encrypted Values

### From Plaintext (Contract-Side)
```solidity
// ⚠️ Only for non-sensitive values (e.g., initialization)
ebool flag = Inco.encryptBool(true);
euint8 small = Inco.encrypt8(42);
euint64 balance = Inco.encrypt64(1000);
```

### From User Input (Client-Side Encryption)
```solidity
function deposit(einput encryptedAmount, bytes calldata proof) external {
    euint64 amount = Inco.asEuint64(encryptedAmount, proof);
    // Now 'amount' is encrypted and safe to use
}
```

---

## Arithmetic Operations

```solidity
euint64 a = Inco.encrypt64(100);
euint64 b = Inco.encrypt64(30);

euint64 sum = Inco.add(a, b);        // 100 + 30 = 130
euint64 diff = Inco.sub(a, b);       // 100 - 30 = 70
euint64 product = Inco.mul(a, b);    // 100 * 30 = 3000
euint64 quotient = Inco.div(a, b);   // 100 / 30 = 3
euint64 remainder = Inco.rem(a, b);  // 100 % 30 = 10

// With plaintext (more gas efficient)
euint64 doubled = Inco.add(a, 100);  // 100 + 100 = 200
```

---

## Comparison Operations

```solidity
euint64 a = Inco.encrypt64(100);
euint64 b = Inco.encrypt64(50);

ebool isEqual = Inco.eq(a, b);       // a == b → false
ebool notEqual = Inco.ne(a, b);      // a != b → true
ebool greater = Inco.gt(a, b);       // a > b  → true
ebool greaterEq = Inco.gte(a, b);    // a >= b → true
ebool less = Inco.lt(a, b);          // a < b  → false
ebool lessEq = Inco.lte(a, b);       // a <= b → false

// Compare with plaintext
ebool aboveMin = Inco.gt(a, 10);     // a > 10 → true
```

---

## Bitwise Operations

```solidity
euint64 a = Inco.encrypt64(0xFF);
euint64 b = Inco.encrypt64(0x0F);

euint64 andResult = Inco.and(a, b);  // 0xFF & 0x0F = 0x0F
euint64 orResult = Inco.or(a, b);    // 0xFF | 0x0F = 0xFF
euint64 xorResult = Inco.xor(a, b);  // 0xFF ^ 0x0F = 0xF0
euint64 notResult = Inco.not(a);     // ~0xFF

euint64 leftShift = Inco.shl(a, 4);  // 0xFF << 4
euint64 rightShift = Inco.shr(a, 4); // 0xFF >> 4
```

---

## Conditional Logic (Select)

```solidity
// select(condition, ifTrue, ifFalse)
euint64 balance = Inco.encrypt64(100);
euint64 minRequired = Inco.encrypt64(50);

ebool hasEnough = Inco.gte(balance, minRequired);

// If hasEnough: use balance, else: use 0
euint64 transferAmount = Inco.select(
    hasEnough,
    balance,
    Inco.encrypt64(0)
);
```

---

## Min / Max

```solidity
euint64 a = Inco.encrypt64(100);
euint64 b = Inco.encrypt64(200);

euint64 minimum = Inco.min(a, b);  // 100
euint64 maximum = Inco.max(a, b);  // 200
```

---

## Decryption

```solidity
euint64 encryptedBalance;

// Request decryption (async - triggers callback)
function requestBalanceReveal() external {
    Inco.decrypt(encryptedBalance);
}

// Callback receives plaintext
function onDecryptionResult(uint256 requestId, uint64 value) external {
    // 'value' is now decrypted
}
```

---

## Reencryption (For User Viewing)

```solidity
euint64 private userBalance;

// Allow user to view their own encrypted balance
function getMyBalance(
    bytes32 publicKey,
    bytes calldata signature
) external view returns (bytes memory) {
    // Verify signature proves ownership
    // Return reencrypted data only user can decrypt
    return Inco.reencrypt(userBalance, publicKey);
}
```

---

## Access Control Pattern

```solidity
mapping(address => euint64) private balances;
mapping(euint64 => eaddress) private allowedViewers;

modifier onlyOwnerCanView(address owner) {
    require(msg.sender == owner, "Not authorized");
    _;
}
```

---

## Common Patterns

### Confidential Counter
```solidity
euint64 private counter;

function increment() external {
    counter = Inco.add(counter, 1);
}
```

### Encrypted Balance Check
```solidity
function hasMinimumBalance(euint64 balance, uint64 minimum) 
    internal pure returns (ebool) 
{
    return Inco.gte(balance, minimum);
}
```

### Safe Transfer
```solidity
function transfer(address to, einput amount, bytes calldata proof) external {
    euint64 transferAmount = Inco.asEuint64(amount, proof);
    
    // Check sender has enough (encrypted comparison)
    ebool hasEnough = Inco.gte(balances[msg.sender], transferAmount);
    
    // Conditional update (only if hasEnough is true)
    balances[msg.sender] = Inco.select(
        hasEnough,
        Inco.sub(balances[msg.sender], transferAmount),
        balances[msg.sender]  // No change if insufficient
    );
    
    balances[to] = Inco.select(
        hasEnough,
        Inco.add(balances[to], transferAmount),
        balances[to]  // No change if insufficient
    );
}
```

### Private Voting
```solidity
euint64 private yesVotes;
euint64 private noVotes;

function vote(einput encryptedVote, bytes calldata proof) external {
    euint64 v = Inco.asEuint64(encryptedVote, proof); // 1=yes, 0=no
    
    yesVotes = Inco.add(yesVotes, v);
    noVotes = Inco.add(noVotes, Inco.sub(Inco.encrypt64(1), v));
}
```

---

## Gas Considerations

| Operation | Relative Cost |
|-----------|---------------|
| `add`, `sub` | Low |
| `mul` | Medium |
| `div`, `rem` | High |
| Comparisons | Medium |
| `select` | Medium |
| `decrypt` | High (async) |

**Tips:**
- Use plaintext second operands when possible: `Inco.add(encrypted, 100)`
- Batch operations to reduce transaction count
- Minimize decryption requests

---

## Type Conversions

```solidity
euint8 small = Inco.encrypt8(42);
euint64 large = Inco.asEuint64(small);  // Upcast: safe

euint64 big = Inco.encrypt64(256);
euint8 truncated = Inco.asEuint8(big);  // Downcast: may lose data
```

---

## Client-Side Encryption (JavaScript)

```typescript
import { createIncoClient } from "@inco/js";

const client = await createIncoClient({
  chainId: 84532,  // Base Sepolia
  rpcUrl: "https://base-sepolia-rpc.publicnode.com",
});

// Encrypt a value
const { ciphertext, inputProof } = await client.encrypt(100n, {
  accountAddress: userAddress,
  contractAddress: contractAddress,
});

// Send to contract
await contract.deposit(ciphertext, inputProof);
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│                    INCO FHE QUICK REF                   │
├─────────────────────────────────────────────────────────┤
│ TYPES:    ebool, euint8/16/32/64, eaddress, ebytes256   │
├─────────────────────────────────────────────────────────┤
│ CREATE:   Inco.encrypt64(val)    // from plaintext      │
│           Inco.asEuint64(in,pf)  // from user input     │
├─────────────────────────────────────────────────────────┤
│ MATH:     add, sub, mul, div, rem, min, max             │
├─────────────────────────────────────────────────────────┤
│ COMPARE:  eq, ne, gt, gte, lt, lte                      │
├─────────────────────────────────────────────────────────┤
│ LOGIC:    and, or, xor, not, shl, shr, select           │
├─────────────────────────────────────────────────────────┤
│ REVEAL:   Inco.decrypt(val)      // async callback      │
│           Inco.reencrypt(val,pk) // user-specific       │
└─────────────────────────────────────────────────────────┘
```

---

## Resources

- [Full Documentation](https://docs.inco.org)
- [Example Contracts](https://github.com/Inco-fhevm/inco-example-contracts)
- [Discord Support](https://discord.com/invite/inco)
