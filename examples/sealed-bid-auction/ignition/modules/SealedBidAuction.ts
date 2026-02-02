import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SealedBidAuctionModule = buildModule("SealedBidAuctionModule", (m) => {
  // Deploy the auction contract
  const sealedBidAuction = m.contract("SealedBidAuction");

  // Optionally deploy MockNFT for testing
  const mockNFT = m.contract("MockNFT");

  return { sealedBidAuction, mockNFT };
});

export default SealedBidAuctionModule;
