import { expect } from "chai";
import { ethers } from "hardhat";
import { SealedBidAuction, MockNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { createIncoClient } from "@inco/js";

describe("SealedBidAuction", function () {
  let auction: SealedBidAuction;
  let nft: MockNFT;
  let owner: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let bidder1: HardhatEthersSigner;
  let bidder2: HardhatEthersSigner;
  let bidder3: HardhatEthersSigner;
  let incoClient: any;

  const MINIMUM_BID = ethers.parseEther("0.1"); // 0.1 ETH
  const BIDDING_DURATION = 3600; // 1 hour

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // Initialize Inco client
    incoClient = await createIncoClient({
      chainId: 31337,
      rpcUrl: "http://localhost:8545",
    });

    // Deploy MockNFT
    const MockNFTFactory = await ethers.getContractFactory("MockNFT");
    nft = await MockNFTFactory.deploy();
    await nft.waitForDeployment();

    // Deploy SealedBidAuction
    const AuctionFactory = await ethers.getContractFactory("SealedBidAuction");
    auction = await AuctionFactory.deploy();
    await auction.waitForDeployment();

    // Mint NFT to seller
    await nft.mint(seller.address);
  });

  describe("Auction Creation", function () {
    it("should create an auction successfully", async function () {
      // Approve auction contract
      await nft.connect(seller).approve(await auction.getAddress(), 0);

      // Create auction
      const tx = await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );

      await expect(tx).to.emit(auction, "AuctionCreated");

      // Verify auction details
      const auctionData = await auction.getAuction(0);
      expect(auctionData.seller).to.equal(seller.address);
      expect(auctionData.nftContract).to.equal(await nft.getAddress());
      expect(auctionData.tokenId).to.equal(0);
      expect(auctionData.minimumBid).to.equal(MINIMUM_BID);
      expect(auctionData.finalized).to.be.false;
      expect(auctionData.cancelled).to.be.false;
    });

    it("should transfer NFT to auction contract", async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );

      expect(await nft.ownerOf(0)).to.equal(await auction.getAddress());
    });

    it("should increment auction counter", async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );

      expect(await auction.auctionCounter()).to.equal(1);
    });
  });

  describe("Bidding", function () {
    let auctionId: number;

    beforeEach(async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );
      auctionId = 0;
    });

    it("should accept an encrypted bid", async function () {
      const bidAmount = ethers.parseEther("0.5");

      // Encrypt the bid
      const { ciphertext, inputProof } = await incoClient.encrypt(
        BigInt(bidAmount.toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      // Place bid
      const tx = await auction.connect(bidder1).placeBid(
        auctionId,
        ciphertext,
        inputProof,
        { value: bidAmount }
      );

      await expect(tx).to.emit(auction, "BidPlaced").withArgs(auctionId, bidder1.address);

      // Verify bid was recorded
      expect(await auction.hasBid(auctionId, bidder1.address)).to.be.true;
      expect(await auction.getBidderCount(auctionId)).to.equal(1);
    });

    it("should escrow the ETH", async function () {
      const bidAmount = ethers.parseEther("0.5");

      const { ciphertext, inputProof } = await incoClient.encrypt(
        BigInt(bidAmount.toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      await auction.connect(bidder1).placeBid(
        auctionId,
        ciphertext,
        inputProof,
        { value: bidAmount }
      );

      expect(await auction.escrowedFunds(auctionId, bidder1.address)).to.equal(bidAmount);
    });

    it("should reject bids below minimum", async function () {
      const lowBid = ethers.parseEther("0.05"); // Below minimum

      const { ciphertext, inputProof } = await incoClient.encrypt(
        BigInt(lowBid.toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      await expect(
        auction.connect(bidder1).placeBid(
          auctionId,
          ciphertext,
          inputProof,
          { value: lowBid }
        )
      ).to.be.revertedWithCustomError(auction, "BidTooLow");
    });

    it("should reject double bidding", async function () {
      const bidAmount = ethers.parseEther("0.5");

      const { ciphertext, inputProof } = await incoClient.encrypt(
        BigInt(bidAmount.toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      // First bid
      await auction.connect(bidder1).placeBid(
        auctionId,
        ciphertext,
        inputProof,
        { value: bidAmount }
      );

      // Second bid should fail
      const { ciphertext: c2, inputProof: p2 } = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.6").toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      await expect(
        auction.connect(bidder1).placeBid(auctionId, c2, p2, { value: ethers.parseEther("0.6") })
      ).to.be.revertedWithCustomError(auction, "AlreadyBid");
    });

    it("should accept multiple different bidders", async function () {
      // Bidder 1
      const bid1 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.5").toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder1).placeBid(
        auctionId,
        bid1.ciphertext,
        bid1.inputProof,
        { value: ethers.parseEther("0.5") }
      );

      // Bidder 2
      const bid2 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.7").toString()),
        {
          accountAddress: bidder2.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder2).placeBid(
        auctionId,
        bid2.ciphertext,
        bid2.inputProof,
        { value: ethers.parseEther("0.7") }
      );

      // Bidder 3
      const bid3 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.3").toString()),
        {
          accountAddress: bidder3.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder3).placeBid(
        auctionId,
        bid3.ciphertext,
        bid3.inputProof,
        { value: ethers.parseEther("0.3") }
      );

      expect(await auction.getBidderCount(auctionId)).to.equal(3);
    });

    it("should reject bids after auction ends", async function () {
      // Fast forward past bidding period
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const { ciphertext, inputProof } = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.5").toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );

      await expect(
        auction.connect(bidder1).placeBid(
          auctionId,
          ciphertext,
          inputProof,
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.revertedWithCustomError(auction, "AuctionEnded");
    });
  });

  describe("Auction Finalization", function () {
    let auctionId: number;

    beforeEach(async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );
      auctionId = 0;

      // Place bids from multiple bidders
      const bid1 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.5").toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder1).placeBid(
        auctionId,
        bid1.ciphertext,
        bid1.inputProof,
        { value: ethers.parseEther("0.5") }
      );

      const bid2 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.8").toString()), // Highest bid
        {
          accountAddress: bidder2.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder2).placeBid(
        auctionId,
        bid2.ciphertext,
        bid2.inputProof,
        { value: ethers.parseEther("0.8") }
      );

      const bid3 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.3").toString()),
        {
          accountAddress: bidder3.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder3).placeBid(
        auctionId,
        bid3.ciphertext,
        bid3.inputProof,
        { value: ethers.parseEther("0.3") }
      );
    });

    it("should not finalize before bidding ends", async function () {
      await expect(
        auction.finalizeAuction(auctionId)
      ).to.be.revertedWithCustomError(auction, "AuctionNotEnded");
    });

    it("should finalize auction after bidding ends", async function () {
      // Fast forward
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const tx = await auction.finalizeAuction(auctionId);
      await expect(tx).to.emit(auction, "AuctionFinalized");

      const auctionData = await auction.getAuction(auctionId);
      expect(auctionData.finalized).to.be.true;
    });

    it("should transfer NFT to winner", async function () {
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.finalizeAuction(auctionId);

      const auctionData = await auction.getAuction(auctionId);
      expect(await nft.ownerOf(0)).to.equal(auctionData.winner);
    });

    it("should not allow double finalization", async function () {
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.finalizeAuction(auctionId);

      await expect(
        auction.finalizeAuction(auctionId)
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyFinalized");
    });
  });

  describe("Refunds", function () {
    let auctionId: number;

    beforeEach(async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );
      auctionId = 0;

      // Place bids
      const bid1 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.5").toString()),
        {
          accountAddress: bidder1.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder1).placeBid(
        auctionId,
        bid1.ciphertext,
        bid1.inputProof,
        { value: ethers.parseEther("0.5") }
      );

      const bid2 = await incoClient.encrypt(
        BigInt(ethers.parseEther("0.8").toString()),
        {
          accountAddress: bidder2.address,
          contractAddress: await auction.getAddress(),
        }
      );
      await auction.connect(bidder2).placeBid(
        auctionId,
        bid2.ciphertext,
        bid2.inputProof,
        { value: ethers.parseEther("0.8") }
      );

      // Finalize
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);
      await auction.finalizeAuction(auctionId);
    });

    it("should allow losing bidders to claim refund", async function () {
      const auctionData = await auction.getAuction(auctionId);
      const loser = auctionData.winner === bidder1.address ? bidder2 : bidder1;

      const balanceBefore = await ethers.provider.getBalance(loser.address);

      const tx = await auction.connect(loser).claimRefund(auctionId);
      await expect(tx).to.emit(auction, "BidRefunded");

      const balanceAfter = await ethers.provider.getBalance(loser.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("should not allow double refund", async function () {
      const auctionData = await auction.getAuction(auctionId);
      const loser = auctionData.winner === bidder1.address ? bidder2 : bidder1;

      await auction.connect(loser).claimRefund(auctionId);

      await expect(
        auction.connect(loser).claimRefund(auctionId)
      ).to.be.revertedWithCustomError(auction, "AlreadyRefunded");
    });
  });

  describe("Cancellation", function () {
    it("should allow seller to cancel auction with no bids", async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );

      const tx = await auction.connect(seller).cancelAuction(0);
      await expect(tx).to.emit(auction, "AuctionCancelled");

      // NFT should be returned to seller
      expect(await nft.ownerOf(0)).to.equal(seller.address);
    });

    it("should not allow non-seller to cancel", async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );

      await expect(
        auction.connect(bidder1).cancelAuction(0)
      ).to.be.revertedWithCustomError(auction, "NotSeller");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await nft.connect(seller).approve(await auction.getAddress(), 0);
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        MINIMUM_BID,
        BIDDING_DURATION
      );
    });

    it("should correctly report auction active status", async function () {
      expect(await auction.isAuctionActive(0)).to.be.true;

      // Fast forward
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await auction.isAuctionActive(0)).to.be.false;
    });

    it("should correctly report time remaining", async function () {
      const remaining = await auction.getTimeRemaining(0);
      expect(remaining).to.be.gt(0);
      expect(remaining).to.be.lte(BIDDING_DURATION);

      // Fast forward
      await ethers.provider.send("evm_increaseTime", [BIDDING_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await auction.getTimeRemaining(0)).to.equal(0);
    });
  });
});
