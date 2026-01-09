import { expect } from "chai";
import { HexString } from "@inco/js";
import {
  Address,
  parseEther,
  formatEther,
  getAddress
} from "viem";
import confidentialERC20Abi from "../artifacts/contracts/ConfidentialERC20.sol/ConfidentialERC20.json";
import { encryptValue, decryptValue, getFee } from "../utils/incoHelper";
import { namedWallets, wallet, publicClient } from "../utils/wallet";

describe("ConfidentialERC20 Tests", function () {
  let contractAddress: Address;

  beforeEach(async function () {
    console.log("\nSetting up ConfidentialERC20 test environment");

    // Deploy the contract
    const txHash = await wallet.deployContract({
      abi: confidentialERC20Abi.abi,
      bytecode: confidentialERC20Abi.bytecode as HexString,
      args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    contractAddress = receipt.contractAddress as Address;
    console.log(`Contract deployed at: ${contractAddress}`);

    // Fund test wallets if needed
    for (const [name, userWallet] of Object.entries(namedWallets)) {
      const balance = await publicClient.getBalance({
        address: userWallet.account?.address as Address,
      });
      const balanceEth = Number(formatEther(balance));

      if (balanceEth < 0.01) {
        const neededEth = 0.01 - balanceEth;
        console.log(`Funding ${name} with ${neededEth.toFixed(6)} ETH...`);
        const tx = await wallet.sendTransaction({
          to: userWallet.account?.address as Address,
          value: parseEther(neededEth.toFixed(6)),
        });

        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(`${name} funded: ${userWallet.account?.address as Address}`);
      }
    }
  });

  describe("----------- Minting Tests -----------", function () {
    it("Should mint tokens using plain mint() by owner", async function () {
      console.log("\nMinting 5000 cUSD to Owner");
      const plainTextAmount = parseEther("5000");

      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: confidentialERC20Abi.abi,
        functionName: "mint",
        args: [plainTextAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Mint successful: 5000 cUSD added to Owner's balance");

      // Fetch owner's balance handle
      console.log("\nFetching Balance Handle for Owner");
      const eBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      })) as HexString;

      // Wait for co-validator
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Decrypt balance
      const decryptedBalance = await decryptValue({
        walletClient: wallet,
        handle: eBalanceHandle.toString(),
      });

      console.log(`Decrypted Owner Balance: ${formatEther(decryptedBalance)} cUSD`);
      expect(decryptedBalance).to.equal(plainTextAmount);
    });

    it("Should mint tokens using encryptedMint()", async function () {
      console.log("\nEncrypted Minting 3000 cUSD to Alice");
      const plainTextAmount = parseEther("3000");

      // Encrypt the amount
      const encryptedAmount = await encryptValue({
        value: plainTextAmount,
        address: namedWallets.alice.account?.address as Address,
        contractAddress,
      });


      // Get fee amount
      const fee = await getFee();

      // Mint with encrypted amount
      const txHash = await namedWallets.alice.writeContract({
        address: contractAddress,
        abi: confidentialERC20Abi.abi,
        functionName: "encryptedMint",
        args: [encryptedAmount],
        value: fee,
        account: namedWallets.alice.account!,
        chain: namedWallets.alice.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 5 });
      console.log("Encrypted mint successful");

      // Wait for co-validator
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Fetch Alice's balance
      const eBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [namedWallets.alice.account?.address as Address],
      })) as HexString;

      console.log("Balance handle after mint:", eBalanceHandle);

      const decryptedBalance = await decryptValue({
        walletClient: namedWallets.alice,
        handle: eBalanceHandle.toString(),
      });

      console.log(`Decrypted Alice Balance: ${formatEther(decryptedBalance)} cUSD`);
      expect(decryptedBalance).to.equal(plainTextAmount);
    });

    it("Should revert encryptedMint() if insufficient fee provided", async function () {
      console.log("\nTesting Insufficient Fee for Encrypted Mint");
      const plainTextAmount = parseEther("1000");

      const encryptedAmount = await encryptValue({
        value: plainTextAmount,
        address: namedWallets.alice.account?.address as Address,
        contractAddress,
      });

      try {
        const txHash = await namedWallets.alice.writeContract({
          address: contractAddress,
          abi: confidentialERC20Abi.abi,
          functionName: "encryptedMint",
          args: [encryptedAmount],
          value: 0n,
          account: namedWallets.alice.account!,
          chain: namedWallets.alice.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        expect.fail("Should have reverted with InsufficientFees");
      } catch (error: any) {
        console.log("Transaction reverted as expected");
        expect(error.message).to.include("InsufficientFees");
      }
    });
  });

  describe("------- Transfer Tests -------", function () {
    beforeEach(async function () {
      // Mint 5000 cUSD to owner for transfer tests
      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: confidentialERC20Abi.abi,
        functionName: "mint",
        args: [parseEther("5000")],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it("Should transfer tokens from owner to Bob", async function () {
      console.log("\nTransferring 1000 cUSD from Owner to Bob");
      const transferAmount = parseEther("1000");

      const encryptedAmount = await encryptValue({
        value: transferAmount,
        address: wallet.account.address,
        contractAddress,
      });

      const fee = await getFee();

      // Filter ABI to only include the bytes version of transfer
      const transferAbi = confidentialERC20Abi.abi.filter(
        (item: any) =>
          item.type === "function" &&
          item.name === "transfer" &&
          item.stateMutability === "payable" &&
          item.inputs?.[1]?.type === "bytes"
      );

      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: transferAbi,
        functionName: "transfer",
        args: [
          namedWallets.bob.account?.address as Address,
          encryptedAmount,
        ],
        value: fee,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Transfer successful");

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify owner's new balance (should be 4000)
      const ownerNewBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      })) as HexString;

      const ownerBalance = await decryptValue({
        walletClient: wallet,
        handle: ownerNewBalanceHandle.toString(),
      });

      console.log(`Owner Balance After Transfer: ${formatEther(ownerBalance)} cUSD`);

      // Verify Bob's balance (should be 1000)
      const bobBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [namedWallets.bob.account?.address as Address],
      })) as HexString;

      const bobBalance = await decryptValue({
        walletClient: namedWallets.bob,
        handle: bobBalanceHandle.toString(),
      });

      console.log(`Bob Balance After Transfer: ${formatEther(bobBalance)} cUSD`);
      expect(ownerBalance).to.equal(parseEther("4000"));
      expect(bobBalance).to.equal(parseEther("1000"));
    });
  });

  describe("------- Approval and Allowance Tests -------", function () {
    beforeEach(async function () {
      // Mint 5000 cUSD to owner for approval tests
      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: confidentialERC20Abi.abi,
        functionName: "mint",
        args: [parseEther("5000")],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it("Should approve spending allowance", async function () {
      console.log("\nApproving Bob to spend 2000 cUSD");
      const approvalAmount = parseEther("2000");

      const encryptedAmount = await encryptValue({
        value: approvalAmount,
        address: wallet.account.address,
        contractAddress,
      });

      const fee = await getFee();

      // Filter ABI to only include the bytes version of approve
      const approveAbi = confidentialERC20Abi.abi.filter(
        (item: any) =>
          item.type === "function" &&
          item.name === "approve" &&
          item.stateMutability === "payable" &&
          item.inputs?.[1]?.type === "bytes"
      );

      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: approveAbi,
        functionName: "approve",
        args: [namedWallets.bob.account?.address as Address, encryptedAmount],
        value: fee,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Approval successful");

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const allowanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "allowance",
        args: [wallet.account.address, namedWallets.bob.account?.address as Address],
      })) as HexString;

      const allowanceValue = await decryptValue({
        walletClient: wallet,
        handle: allowanceHandle.toString(),
      });

      console.log(`Bob's Allowance: ${formatEther(allowanceValue)} cUSD`);
      expect(allowanceValue).to.equal(approvalAmount);
    });
  });

  describe("------- TransferFrom Tests -------", function () {
    beforeEach(async function () {
      // Mint 5000 cUSD to owner
      const mintTx = await wallet.writeContract({
        address: contractAddress,
        abi: confidentialERC20Abi.abi,
        functionName: "mint",
        args: [parseEther("5000")],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintTx });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Approve Bob to spend 3000 cUSD
      const approvalAmount = parseEther("3000");
      const encryptedAmount = await encryptValue({
        value: approvalAmount,
        address: wallet.account.address,
        contractAddress,
      });

      const fee = await getFee();

      // Filter ABI to only include the bytes version of approve
      const approveAbi = confidentialERC20Abi.abi.filter(
        (item: any) =>
          item.type === "function" &&
          item.name === "approve" &&
          item.stateMutability === "payable" &&
          item.inputs?.[1]?.type === "bytes"
      );

      const approveTx = await wallet.writeContract({
        address: contractAddress,
        abi: approveAbi,
        functionName: "approve",
        args: [namedWallets.bob.account?.address as Address, encryptedAmount],
        value: fee,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log("Bob approved to spend 3000 cUSD from owner");
    });

    it("Should transferFrom owner to Alice using Bob's allowance", async function () {
      console.log("\nBob transferring 1500 cUSD from Owner to Alice");
      const transferAmount = parseEther("1500");

      const encryptedAmount = await encryptValue({
        value: transferAmount,
        address: namedWallets.bob.account?.address as Address,
        contractAddress,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const fee = await getFee();

      // Filter ABI to only include the bytes version of transferFrom
      const transferFromAbi = confidentialERC20Abi.abi.filter(
        (item: any) =>
          item.type === "function" &&
          item.name === "transferFrom" &&
          item.stateMutability === "payable" &&
          item.inputs?.[2]?.type === "bytes"
      );

      const txHash = await namedWallets.bob.writeContract({
        address: contractAddress,
        abi: transferFromAbi,
        functionName: "transferFrom",
        args: [
          wallet.account.address,
          namedWallets.dave.account?.address as Address,
          encryptedAmount,
        ],
        value: fee,
        account: namedWallets.bob.account!,
        chain: namedWallets.bob.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("TransferFrom successful");

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify owner's new balance (should be 3500)
      const ownerNewBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      })) as HexString;

      const ownerBalance = await decryptValue({
        walletClient: wallet,
        handle: ownerNewBalanceHandle.toString(),
      });

      console.log(`Owner Balance: ${formatEther(ownerBalance)} cUSD`);
      expect(ownerBalance).to.equal(parseEther("3500"));

      // Verify Dave's new balance (should be 1500)
      const daveBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [namedWallets.dave.account?.address as Address],
      })) as HexString;

      const daveBalance = await decryptValue({
        walletClient: namedWallets.dave,
        handle: daveBalanceHandle.toString(),
      });

      console.log(`Dave Balance: ${formatEther(daveBalance)} cUSD`);
      expect(daveBalance).to.equal(parseEther("1500"));

      // Verify Bob's remaining allowance (should be 1500)
      const remainingAllowanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "allowance",
        args: [wallet.account.address, namedWallets.bob.account?.address as Address],
      })) as HexString;

      const remainingAllowance = await decryptValue({
        walletClient: wallet,
        handle: remainingAllowanceHandle.toString(),
      });

      console.log(`Bob's Remaining Allowance: ${formatEther(remainingAllowance)} cUSD`);
      expect(remainingAllowance).to.equal(parseEther("1500"));
    });

    it("Should revert transferFrom with insufficient allowance", async function () {
      console.log("\nTesting TransferFrom with Insufficient Allowance");
      const transferAmount = parseEther("5000");

      const encryptedAmount = await encryptValue({
        value: transferAmount,
        address: namedWallets.bob.account?.address as Address,
        contractAddress,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const fee = await getFee();

      // Filter ABI to only include the bytes version of transferFrom
      const transferFromAbi = confidentialERC20Abi.abi.filter(
        (item: any) =>
          item.type === "function" &&
          item.name === "transferFrom" &&
          item.stateMutability === "payable" &&
          item.inputs?.[2]?.type === "bytes"
      );

      try {
        const txHash = await namedWallets.bob.writeContract({
          address: contractAddress,
          abi: transferFromAbi,
          functionName: "transferFrom",
          args: [
            wallet.account.address,
            namedWallets.dave.account?.address as Address,
            encryptedAmount,
          ],
          value: fee,
          account: namedWallets.bob.account!,
          chain: namedWallets.bob.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        expect.fail("Should have reverted with InsufficientAllowance");
      } catch (error: any) {
        console.log("Transaction reverted as expected");
        expect(error.message).to.include("InsufficientAllowance");
      }
    });
  });
});
