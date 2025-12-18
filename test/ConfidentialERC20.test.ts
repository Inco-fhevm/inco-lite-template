import { expect } from "chai";
import { namedWallets, wallet, publicClient } from "../utils/wallet";
import {
  Address,
  getContract,
  parseEther,
  formatEther,
  getAddress,
  parseAbiItem,
} from "viem";
import contractAbi from "../artifacts/contracts/ConfidentialERC20.sol/ConfidentialERC20.json";
import { HexString } from "@inco/js";
import { encryptValue, decryptValue, attestedCompute, getConfig, getFee } from "../utils/incoHelper";
import { AttestedComputeSupportedOps, Lightning } from '@inco/js/lite';
import { handleTypes } from '@inco/js';

describe("ConfidentialERC20 Tests", function () {
  let confidentialToken: any;
  let contractAddress: Address;
  let incoConfig: any;

  beforeEach(async function () {
    console.log("\n------ 🚀 Setting up test environment ------");
    
    // Get Inco config
    incoConfig = await getConfig();
    console.log("✅ Inco config initialized");

    // Deploy the contract
    const txHash = await wallet.deployContract({
      abi: contractAbi.abi,
      bytecode: contractAbi.bytecode as HexString,
      args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    contractAddress = receipt.contractAddress as Address;
    console.log(`✅ Contract deployed at: ${contractAddress}`);

    confidentialToken = getContract({
      address: contractAddress as HexString,
      abi: contractAbi.abi,
      client: wallet,
    });

    // Fund test wallets if needed
    for (const [name, userWallet] of Object.entries(namedWallets)) {
      const balance = await publicClient.getBalance({
        address: userWallet.account?.address as Address,
      });
      const balanceEth = Number(formatEther(balance));

      if (balanceEth < 0.01) {
        const neededEth = 0.01 - balanceEth;
        console.log(`💰 Funding ${name} with ${neededEth.toFixed(6)} ETH...`);
        const tx = await wallet.sendTransaction({
          to: userWallet.account?.address as Address,
          value: parseEther(neededEth.toFixed(6)),
        });

        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(`✅ ${name} funded: ${userWallet.account?.address as Address}`);
      }
    }
  });

  describe("Basic Minting Tests", function () {
    it("Should mint tokens using plain mint() by owner", async function () {
      console.log("\n------ 💰 Minting 5000 cUSD to Owner ------");
      const plainTextAmount = parseEther("5000");

      const txHash = await wallet.writeContract({
        address: contractAddress,
        abi: contractAbi.abi,
        functionName: "mint",
        args: [plainTextAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("✅ Mint successful: 5000 cUSD added to Owner's balance");

      // Fetch owner's balance handle
      console.log("\n------ 🔍 Fetching Balance Handle for Owner ------");
      const eBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      })) as HexString;

      // Wait for covalidator
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Decrypt balance
      console.log("🔑 Decrypting balance...");
      const decryptedBalance = await decryptValue({
        walletClient: wallet,
        handle: eBalanceHandle.toString(),
      });

      // fetch the total supply
      const totalSupplyHandle = await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "totalSupply",
      });

      console.log("total supply handle: ", totalSupplyHandle);

      const decryptedTotalSupply = await incoConfig.attestedReveal(
        [totalSupplyHandle as HexString]
      );

      console.log("after total supply: ", decryptedTotalSupply);

      console.log(`🎯 Decrypted Owner Balance: ${formatEther(decryptedBalance)} cUSD`);
      expect(decryptedBalance).to.equal(plainTextAmount);
    });

    it("Should mint tokens using encryptedMint()", async function () {
      console.log("\n------ 💰 Encrypted Minting 3000 cUSD to Alice ------");
      const plainTextAmount = parseEther("3000");
      let inco = await Lightning.latest('devnet', 84532);
      // Encrypt the amount
      const encryptedAmount = await inco.encrypt(plainTextAmount, {
        accountAddress: namedWallets.alice.account?.address as Address,
        dappAddress: contractAddress,
        handleType: handleTypes.euint256,
      });

      console.log("contract addresss: ", contractAddress);
      console.log("✅ Amount encrypted");

      // Fetch Alice's balance
      const preveBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "balanceOf",
        args: [namedWallets.alice.account?.address as Address],
      })) as HexString;

      console.log("balance handle before mint: ", preveBalanceHandle);

      // const prevdecryptedBalance = await decryptValue({
      //   walletClient: namedWallets.alice,
      //   handle: preveBalanceHandle.toString(),
      // });

      // console.log("Previous balance: ", formatEther(prevdecryptedBalance));

      // Get fee amount
      const fee = await getFee();


      // fetch the total supply
      const beforeTotalSupplyHandle = await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "totalSupply",
      });

      console.log("before total supply handle: ", beforeTotalSupplyHandle);

      // Mint with encrypted amount
      const txHash = await namedWallets.alice.writeContract({
        address: contractAddress,
        abi: contractAbi.abi,
        functionName: "encryptedMint",
        args: [encryptedAmount],
        value: fee,
        account: namedWallets.alice.account!,
        chain: namedWallets.alice.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("✅ Encrypted mint successful");


      console.log("Waiting for covalidator to process encrypted operations...");
      // Covalidator can take 10 seconds on testnet
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fetch Alice's balance
      const eBalanceHandle = (await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "balanceOf",
        args: [namedWallets.alice.account?.address as Address],
      })) as HexString;

      console.log("balance handle after mint: ", eBalanceHandle);

      const decryptedBalance = await decryptValue({
        walletClient: namedWallets.alice,
        handle: eBalanceHandle.toString(),
      });

      // fetch the total supply
      const totalSupplyHandle = await publicClient.readContract({
        address: getAddress(contractAddress),
        abi: contractAbi.abi,
        functionName: "totalSupply",
      });

      const decryptedTotalSupply = await inco.attestedReveal(
        [totalSupplyHandle as HexString]
      );

      console.log("after total supply: ", decryptedTotalSupply);

      console.log("balance  after mint: ", decryptedBalance);

      console.log(`🎯 Decrypted Alice Balance: ${formatEther(decryptedBalance)} cUSD`);
      expect(decryptedBalance).to.equal(plainTextAmount);
    });

    it.skip("Should revert encryptedMint() if insufficient fee provided", async function () {
      console.log("\n------ ❌ Testing Insufficient Fee for Encrypted Mint ------");
      const plainTextAmount = parseEther("1000");

      const encryptedAmount = await encryptValue({
        value: plainTextAmount,
        address: namedWallets.alice.account?.address as Address,
        contractAddress,
      });

      // Try to mint with insufficient fee (0 ETH)
      try {
        const txHash = await namedWallets.alice.writeContract({
          address: contractAddress,
          abi: contractAbi.abi,
          functionName: "encryptedMint",
          args: [encryptedAmount],
          value: 0n, // No fee provided
          account: namedWallets.alice.account!,
          chain: namedWallets.alice.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        expect.fail("Should have reverted with InsufficientFees");
      } catch (error: any) {
        console.log("✅ Transaction reverted as expected");
        expect(error.message).to.include("InsufficientFees");
      }
    });
  });

  // describe("Transfer Tests", function () {
  //   beforeEach(async function () {
  //     // Mint 5000 cUSD to owner for transfer tests
  //     const txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "mint",
  //       args: [parseEther("5000")],
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     await new Promise(resolve => setTimeout(resolve, 2000));
  //   });

  //   it("Should transfer tokens from owner to Alice", async function () {
  //     console.log("\n------ 📤 Transferring 1000 cUSD from Owner to Alice ------");
  //     const transferAmount = parseEther("1000");

  //     // Get owner's balance handle for attestation
  //     const ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     // Encrypt the transfer amount
  //     console.log("🔐 Encrypting transfer amount...");
  //     const encryptedAmount = await encryptValue({
  //       value: transferAmount,
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     // Get attestation that balance >= amount
  //     console.log("🔐 Getting attestation for sufficient balance...");
  //     await new Promise(resolve => setTimeout(resolve, 2000));
      
  //     const result = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     console.log("✅ Attestation received");
  //     console.log("   - Plaintext:", result.plaintext);
  //     console.log("   - Handle:", result.attestation.handle);
  //     console.log("   - Value:", result.attestation.value);
  //     console.log("   - Signature count:", result.signature.length);

  //     // Get fee
  //     const fee = await getFee();

  //     // Perform transfer
  //     const transferFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "transfer" &&
  //         item.inputs.length === 4 &&
  //         item.inputs[1].type === "bytes"
  //     );

  //     const txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: [transferFunctionAbi],
  //       functionName: "transfer",
  //       args: [
  //         namedWallets.alice.account?.address as Address,
  //         encryptedAmount,
  //         result.attestation,
  //         result.signature,
  //       ],
  //       value: fee,
  //     });

  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     console.log("✅ Transfer successful");

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Verify owner's new balance (should be 4000)
  //     const ownerNewBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     const ownerBalance = await decryptValue({
  //       walletClient: wallet,
  //       handle: ownerNewBalanceHandle.toString(),
  //     });

  //     console.log(`🎯 Owner Balance After Transfer: ${formatEther(ownerBalance)} cUSD`);
  //     expect(ownerBalance).to.equal(parseEther("4000"));

  //     // Verify Alice's balance (should be 1000)
  //     const aliceBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [namedWallets.alice.account?.address as Address],
  //     })) as HexString;

  //     const aliceBalance = await decryptValue({
  //       walletClient: namedWallets.alice,
  //       handle: aliceBalanceHandle.toString(),
  //     });

  //     console.log(`🎯 Alice Balance After Transfer: ${formatEther(aliceBalance)} cUSD`);
  //     expect(aliceBalance).to.equal(parseEther("1000"));
  //   });

  //   it("Should revert transfer with insufficient balance", async function () {
  //     console.log("\n------ ❌ Testing Transfer with Insufficient Balance ------");
  //     const transferAmount = parseEther("10000"); // More than balance

  //     const ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     const encryptedAmount = await encryptValue({
  //       value: transferAmount,
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Get attestation (should be false)
  //     const result = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     const fee = await getFee();

  //     const transferFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "transfer" &&
  //         item.inputs.length === 4 &&
  //         item.inputs[1].type === "bytes"
  //     );

  //     try {
  //       const txHash = await wallet.writeContract({
  //         address: contractAddress,
  //         abi: [transferFunctionAbi],
  //         functionName: "transfer",
  //         args: [
  //           namedWallets.alice.account?.address as Address,
  //           encryptedAmount,
  //           result.attestation,
  //           result.signature,
  //         ],
  //         value: fee,
  //       });
  //       await publicClient.waitForTransactionReceipt({ hash: txHash });
  //       expect.fail("Should have reverted with InsufficientBalance");
  //     } catch (error: any) {
  //       console.log("✅ Transaction reverted as expected");
  //       expect(error.message).to.include("InsufficientBalance");
  //     }
  //   });
  // });

  // describe("Approval and Allowance Tests", function () {
  //   beforeEach(async function () {
  //     // Mint 5000 cUSD to Alice for approval tests
  //     const txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "mint",
  //       args: [parseEther("5000")],
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     await new Promise(resolve => setTimeout(resolve, 2000));
  //   });

  //   it("Should approve spending allowance", async function () {
  //     console.log("\n------ ✅ Approving Bob to spend 2000 cUSD ------");
  //     const approvalAmount = parseEther("2000");

  //     // Encrypt approval amount
  //     const encryptedAmount = await encryptValue({
  //       value: approvalAmount,
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     // Get fee
  //     const fee = await getFee();

  //     // Approve Bob
  //     const approveFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "approve" &&
  //         item.inputs.length === 2 &&
  //         item.inputs[1].type === "bytes"
  //     );

  //     const txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: [approveFunctionAbi],
  //       functionName: "approve",
  //       args: [namedWallets.bob.account?.address as Address, encryptedAmount],
  //       value: fee,
  //     });

  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     console.log("✅ Approval successful");

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Check allowance
  //     const allowanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "allowance",
  //       args: [wallet.account.address, namedWallets.bob.account?.address as Address],
  //     })) as HexString;

  //     const allowanceValue = await decryptValue({
  //       walletClient: wallet,
  //       handle: allowanceHandle.toString(),
  //     });

  //     console.log(`🎯 Bob's Allowance: ${formatEther(allowanceValue)} cUSD`);
  //     expect(allowanceValue).to.equal(approvalAmount);
  //   });
  // });

  // describe("TransferFrom Tests", function () {
  //   beforeEach(async function () {
  //     // Mint 5000 cUSD to owner
  //     const mintTx = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "mint",
  //       args: [parseEther("5000")],
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: mintTx });
  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Approve Bob to spend 3000 cUSD
  //     const approvalAmount = parseEther("3000");
  //     const encryptedAmount = await encryptValue({
  //       value: approvalAmount,
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     const fee = await getFee();

  //     const approveFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "approve" &&
  //         item.inputs.length === 2 &&
  //         item.inputs[1].type === "bytes"
  //     );

  //     const approveTx = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: [approveFunctionAbi],
  //       functionName: "approve",
  //       args: [namedWallets.bob.account?.address as Address, encryptedAmount],
  //       value: fee,
  //     });

  //     await publicClient.waitForTransactionReceipt({ hash: approveTx });
  //     await new Promise(resolve => setTimeout(resolve, 2000));
  //     console.log("✅ Bob approved to spend 3000 cUSD from owner");
  //   });

  //   it("Should transferFrom owner to Alice using Bob's allowance", async function () {
  //     console.log("\n------ 📤 Bob transferring 1500 cUSD from Owner to Alice ------");
  //     const transferAmount = parseEther("1500");

  //     // Get owner's balance handle
  //     const ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     // Get allowance handle
  //     const allowanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "allowance",
  //       args: [wallet.account.address, namedWallets.bob.account?.address as Address],
  //     })) as HexString;

  //     // Encrypt transfer amount
  //     const encryptedAmount = await encryptValue({
  //       value: transferAmount,
  //       address: namedWallets.bob.account?.address as Address,
  //       contractAddress,
  //     });

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Get balance attestation
  //     const balanceAttestation = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     // Get allowance attestation
  //     const allowanceAttestation = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: allowanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     console.log("✅ Attestations received");

  //     // Perform transferFrom
  //     const transferFromFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "transferFrom" &&
  //         item.inputs.length === 7 &&
  //         item.inputs[2].type === "bytes"
  //     );

  //     const txHash = await namedWallets.bob.writeContract({
  //       address: contractAddress,
  //       abi: [transferFromFunctionAbi],
  //       functionName: "transferFrom",
  //       args: [
  //         wallet.account.address,
  //         namedWallets.alice.account?.address as Address,
  //         encryptedAmount,
  //         balanceAttestation.attestation,
  //         allowanceAttestation.attestation,
  //         balanceAttestation.signature,
  //         allowanceAttestation.signature,
  //       ],
  //       account: namedWallets.bob.account!,
  //       chain: namedWallets.bob.chain,
  //     });

  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     console.log("✅ TransferFrom successful");

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Verify owner's balance (should be 3500)
  //     const ownerNewBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     const ownerBalance = await decryptValue({
  //       walletClient: wallet,
  //       handle: ownerNewBalanceHandle.toString(),
  //     });

  //     console.log(`🎯 Owner Balance: ${formatEther(ownerBalance)} cUSD`);
  //     expect(ownerBalance).to.equal(parseEther("3500"));

  //     // Verify Alice's balance (should be 1500)
  //     const aliceBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [namedWallets.alice.account?.address as Address],
  //     })) as HexString;

  //     const aliceBalance = await decryptValue({
  //       walletClient: namedWallets.alice,
  //       handle: aliceBalanceHandle.toString(),
  //     });

  //     console.log(`🎯 Alice Balance: ${formatEther(aliceBalance)} cUSD`);
  //     expect(aliceBalance).to.equal(parseEther("1500"));

  //     // Verify Bob's remaining allowance (should be 1500)
  //     const newAllowanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "allowance",
  //       args: [wallet.account.address, namedWallets.bob.account?.address as Address],
  //     })) as HexString;

  //     const newAllowance = await decryptValue({
  //       walletClient: wallet,
  //       handle: newAllowanceHandle.toString(),
  //     });

  //     console.log(`🎯 Bob's Remaining Allowance: ${formatEther(newAllowance)} cUSD`);
  //     expect(newAllowance).to.equal(parseEther("1500"));
  //   });

  //   it("Should revert transferFrom with insufficient allowance", async function () {
  //     console.log("\n------ ❌ Testing TransferFrom with Insufficient Allowance ------");
  //     const transferAmount = parseEther("5000"); // More than allowance

  //     const ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     const allowanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "allowance",
  //       args: [wallet.account.address, namedWallets.bob.account?.address as Address],
  //     })) as HexString;

  //     const encryptedAmount = await encryptValue({
  //       value: transferAmount,
  //       address: namedWallets.bob.account?.address as Address,
  //       contractAddress,
  //     });

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     const balanceAttestation = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     const allowanceAttestation = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: allowanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: transferAmount,
  //     });

  //     const transferFromFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "transferFrom" &&
  //         item.inputs.length === 7 &&
  //         item.inputs[2].type === "bytes"
  //     );

  //     try {
  //       const txHash = await namedWallets.bob.writeContract({
  //         address: contractAddress,
  //         abi: [transferFromFunctionAbi],
  //         functionName: "transferFrom",
  //         args: [
  //           wallet.account.address,
  //           namedWallets.alice.account?.address as Address,
  //           encryptedAmount,
  //           balanceAttestation.attestation,
  //           allowanceAttestation.attestation,
  //           balanceAttestation.signature,
  //           allowanceAttestation.signature,
  //         ],
  //         account: namedWallets.bob.account!,
  //         chain: namedWallets.bob.chain,
  //       });
  //       await publicClient.waitForTransactionReceipt({ hash: txHash });
  //       expect.fail("Should have reverted with InsufficientAllowance");
  //     } catch (error: any) {
  //       console.log("✅ Transaction reverted as expected");
  //       expect(error.message).to.include("InsufficientAllowance");
  //     }
  //   });
  // });

  // describe("Edge Cases and Security Tests", function () {
  //   it("Should not allow non-owner to mint", async function () {
  //     console.log("\n------ ❌ Testing Non-Owner Mint Attempt ------");
  //     try {
  //       const txHash = await namedWallets.alice.writeContract({
  //         address: contractAddress,
  //         abi: contractAbi.abi,
  //         functionName: "mint",
  //         args: [parseEther("1000")],
  //         account: namedWallets.alice.account!,
  //         chain: namedWallets.alice.chain,
  //       });
  //       await publicClient.waitForTransactionReceipt({ hash: txHash });
  //       expect.fail("Should have reverted - only owner can mint");
  //     } catch (error: any) {
  //       console.log("✅ Transaction reverted as expected");
  //       expect(error.message).to.match(/OwnableUnauthorizedAccount|Ownable/);
  //     }
  //   });

  //   it("Should handle multiple sequential transfers correctly", async function () {
  //     console.log("\n------ 🔄 Testing Multiple Sequential Transfers ------");
      
  //     // Mint to owner
  //     const mintTx = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "mint",
  //       args: [parseEther("10000")],
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: mintTx });
  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     const fee = await getFee();

  //     // Transfer 1: Owner -> Alice (1000)
  //     let ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     let encryptedAmount = await encryptValue({
  //       value: parseEther("1000"),
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     let result = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: parseEther("1000"),
  //     });

  //     const transferFunctionAbi = contractAbi.abi.find(
  //       (item) =>
  //         item.name === "transfer" &&
  //         item.inputs.length === 4 &&
  //         item.inputs[1].type === "bytes"
  //     );

  //     let txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: [transferFunctionAbi],
  //       functionName: "transfer",
  //       args: [
  //         namedWallets.alice.account?.address as Address,
  //         encryptedAmount,
  //         result.attestation,
  //         result.signature,
  //       ],
  //       value: fee,
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     console.log("✅ Transfer 1: Owner -> Alice (1000)");

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Transfer 2: Owner -> Bob (2000)
  //     ownerBalanceHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "balanceOf",
  //       args: [wallet.account.address],
  //     })) as HexString;

  //     encryptedAmount = await encryptValue({
  //       value: parseEther("2000"),
  //       address: wallet.account.address,
  //       contractAddress,
  //     });

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     result = await attestedCompute({
  //       walletClient: wallet,
  //       lhsHandle: ownerBalanceHandle,
  //       op: AttestedComputeSupportedOps.Ge,
  //       rhsPlaintext: parseEther("2000"),
  //     });

  //     txHash = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: [transferFunctionAbi],
  //       functionName: "transfer",
  //       args: [
  //         namedWallets.bob.account?.address as Address,
  //         encryptedAmount,
  //         result.attestation,
  //         result.signature,
  //       ],
  //       value: fee,
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: txHash });
  //     console.log("✅ Transfer 2: Owner -> Bob (2000)");

  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Verify final balances
  //     const ownerFinalBalance = await decryptValue({
  //       walletClient: wallet,
  //       handle: (await publicClient.readContract({
  //         address: getAddress(contractAddress),
  //         abi: contractAbi.abi,
  //         functionName: "balanceOf",
  //         args: [wallet.account.address],
  //       })) as string,
  //     });

  //     const aliceBalance = await decryptValue({
  //       walletClient: namedWallets.alice,
  //       handle: (await publicClient.readContract({
  //         address: getAddress(contractAddress),
  //         abi: contractAbi.abi,
  //         functionName: "balanceOf",
  //         args: [namedWallets.alice.account?.address as Address],
  //       })) as string,
  //     });

  //     const bobBalance = await decryptValue({
  //       walletClient: namedWallets.bob,
  //       handle: (await publicClient.readContract({
  //         address: getAddress(contractAddress),
  //         abi: contractAbi.abi,
  //         functionName: "balanceOf",
  //         args: [namedWallets.bob.account?.address as Address],
  //       })) as string,
  //     });

  //     console.log(`🎯 Final Owner Balance: ${formatEther(ownerFinalBalance)} cUSD`);
  //     console.log(`🎯 Final Alice Balance: ${formatEther(aliceBalance)} cUSD`);
  //     console.log(`🎯 Final Bob Balance: ${formatEther(bobBalance)} cUSD`);

  //     expect(ownerFinalBalance).to.equal(parseEther("7000"));
  //     expect(aliceBalance).to.equal(parseEther("1000"));
  //     expect(bobBalance).to.equal(parseEther("2000"));
  //   });

  //   it("Should maintain correct total supply after minting and transfers", async function () {
  //     console.log("\n------ 📊 Testing Total Supply Tracking ------");
      
  //     // Mint 5000 to owner
  //     let mintTx = await wallet.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "mint",
  //       args: [parseEther("5000")],
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: mintTx });
  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Check total supply
  //     let totalSupplyHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "getTotalSupply",
  //     })) as HexString;

  //     let totalSupply = await decryptValue({
  //       walletClient: wallet,
  //       handle: totalSupplyHandle.toString(),
  //     });

  //     console.log(`🎯 Total Supply after first mint: ${formatEther(totalSupply)} cUSD`);
  //     expect(totalSupply).to.equal(parseEther("5000"));

  //     // Encrypted mint 3000 to Alice
  //     const encryptedAmount = await encryptValue({
  //       value: parseEther("3000"),
  //       address: namedWallets.alice.account?.address as Address,
  //       contractAddress,
  //     });

  //     const fee = await getFee();

  //     mintTx = await namedWallets.alice.writeContract({
  //       address: contractAddress,
  //       abi: contractAbi.abi,
  //       functionName: "encryptedMint",
  //       args: [encryptedAmount],
  //       value: fee,
  //       account: namedWallets.alice.account!,
  //       chain: namedWallets.alice.chain,
  //     });
  //     await publicClient.waitForTransactionReceipt({ hash: mintTx });
  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Check updated total supply
  //     totalSupplyHandle = (await publicClient.readContract({
  //       address: getAddress(contractAddress),
  //       abi: contractAbi.abi,
  //       functionName: "getTotalSupply",
  //     })) as HexString;

  //     totalSupply = await decryptValue({
  //       walletClient: wallet,
  //       handle: totalSupplyHandle.toString(),
  //     });

  //     console.log(`🎯 Total Supply after encrypted mint: ${formatEther(totalSupply)} cUSD`);
  //     expect(totalSupply).to.equal(parseEther("8000"));
  //   });
  // });
});