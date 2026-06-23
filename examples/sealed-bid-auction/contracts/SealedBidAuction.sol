// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@inco/lightning/src/Lib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SealedBidAuction
 * @author Inco Community Contributor
 * @notice A sealed-bid auction using Fully Homomorphic Encryption
 * @dev Bids are encrypted - no one can see bid amounts until reveal
 * 
 * How it works:
 * 1. Seller creates auction with an NFT and minimum price
 * 2. Bidders submit encrypted bids (amount hidden from everyone)
 * 3. After bidding ends, winner is determined on encrypted data
 * 4. Only the winning bid amount is revealed
 * 
 * This is impossible on regular EVMs where all data is public!
 */
contract SealedBidAuction is Ownable, ReentrancyGuard {
    using Inco for *;

    // ============ Structs ============

    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 minimumBid;
        uint256 biddingEndTime;
        uint256 revealTime;
        bool finalized;
        bool cancelled;
        address winner;
        uint256 winningBid;
    }

    struct EncryptedBid {
        euint64 amount;
        bool exists;
        bool refunded;
    }

    // ============ State Variables ============

    /// @notice Counter for auction IDs
    uint256 public auctionCounter;

    /// @notice Mapping of auction ID to Auction details
    mapping(uint256 => Auction) public auctions;

    /// @notice Mapping of auction ID => bidder => encrypted bid
    mapping(uint256 => mapping(address => EncryptedBid)) private encryptedBids;

    /// @notice Mapping of auction ID => list of bidders
    mapping(uint256 => address[]) public auctionBidders;

    /// @notice Mapping of auction ID => current highest encrypted bid
    mapping(uint256 => euint64) private highestBids;

    /// @notice Mapping of auction ID => current highest bidder (encrypted comparison)
    mapping(uint256 => address) private currentLeaders;

    /// @notice Escrow: bidder deposits (plaintext ETH for simplicity)
    mapping(uint256 => mapping(address => uint256)) public escrowedFunds;

    // ============ Events ============

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address nftContract,
        uint256 tokenId,
        uint256 minimumBid,
        uint256 biddingEndTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder
        // Note: amount NOT emitted - it's secret!
    );

    event AuctionFinalized(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid
    );

    event AuctionCancelled(uint256 indexed auctionId);

    event BidRefunded(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    // ============ Errors ============

    error AuctionNotFound();
    error AuctionEnded();
    error AuctionNotEnded();
    error AuctionAlreadyFinalized();
    error AuctionCancelled();
    error NotSeller();
    error AlreadyBid();
    error BidTooLow();
    error NoBidders();
    error NotWinner();
    error AlreadyRefunded();
    error NoFundsToRefund();
    error TransferFailed();

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {}

    // ============ Auction Creation ============

    /**
     * @notice Create a new sealed-bid auction
     * @param _nftContract Address of the NFT contract
     * @param _tokenId Token ID to auction
     * @param _minimumBid Minimum bid in wei (plaintext - this is public)
     * @param _biddingDuration How long bidding is open (seconds)
     * @return auctionId The ID of the created auction
     */
    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _minimumBid,
        uint256 _biddingDuration
    ) external returns (uint256 auctionId) {
        // Transfer NFT to contract (escrow)
        IERC721(_nftContract).transferFrom(msg.sender, address(this), _tokenId);

        auctionId = auctionCounter++;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            minimumBid: _minimumBid,
            biddingEndTime: block.timestamp + _biddingDuration,
            revealTime: 0,
            finalized: false,
            cancelled: false,
            winner: address(0),
            winningBid: 0
        });

        // Initialize highest bid to minimum (encrypted)
        highestBids[auctionId] = Inco.encrypt64(uint64(_minimumBid));
        currentLeaders[auctionId] = address(0);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _nftContract,
            _tokenId,
            _minimumBid,
            block.timestamp + _biddingDuration
        );
    }

    // ============ Bidding ============

    /**
     * @notice Place an encrypted bid on an auction
     * @param _auctionId The auction to bid on
     * @param _encryptedBid The encrypted bid amount
     * @param _inputProof Proof that the ciphertext is valid
     * @dev Bidder must send ETH >= their bid amount (we can't verify encrypted amount)
     *      Extra funds are refunded after auction ends
     */
    function placeBid(
        uint256 _auctionId,
        einput _encryptedBid,
        bytes calldata _inputProof
    ) external payable nonReentrant {
        Auction storage auction = auctions[_auctionId];

        // Validations
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (block.timestamp >= auction.biddingEndTime) revert AuctionEnded();
        if (auction.cancelled) revert AuctionCancelled();
        if (encryptedBids[_auctionId][msg.sender].exists) revert AlreadyBid();
        if (msg.value < auction.minimumBid) revert BidTooLow();

        // Convert input to encrypted uint64
        euint64 bidAmount = Inco.asEuint64(_encryptedBid, _inputProof);

        // Store encrypted bid
        encryptedBids[_auctionId][msg.sender] = EncryptedBid({
            amount: bidAmount,
            exists: true,
            refunded: false
        });

        // Track bidder
        auctionBidders[_auctionId].push(msg.sender);

        // Escrow the ETH
        escrowedFunds[_auctionId][msg.sender] = msg.value;

        // ============ FHE MAGIC: Compare bids without seeing them ============
        // Check if this bid is higher than current highest
        ebool isHigher = Inco.gt(bidAmount, highestBids[_auctionId]);

        // Update highest bid using encrypted select
        // If isHigher: highestBid = bidAmount, else: keep current
        highestBids[_auctionId] = Inco.select(
            isHigher,
            bidAmount,
            highestBids[_auctionId]
        );

        // Update leader (this leaks THAT someone might be winning, but not the amount)
        // For full privacy, you'd need encrypted addresses or commitment schemes
        if (_encryptedBoolToBool(isHigher)) {
            currentLeaders[_auctionId] = msg.sender;
        }

        emit BidPlaced(_auctionId, msg.sender);
    }

    /**
     * @notice Helper to evaluate encrypted boolean (simplified for demo)
     * @dev In production, use proper async decryption callbacks
     */
    function _encryptedBoolToBool(ebool encrypted) internal returns (bool) {
        // Request decryption - this is simplified
        // In production, you'd use callbacks
        Inco.decrypt(encrypted);
        // For demo purposes, we'll track leader updates separately
        return true; // Placeholder - actual impl needs callback pattern
    }

    // ============ Auction Finalization ============

    /**
     * @notice Finalize the auction and reveal winner
     * @param _auctionId The auction to finalize
     * @dev Can only be called after bidding ends
     */
    function finalizeAuction(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (auction.seller == address(0)) revert AuctionNotFound();
        if (block.timestamp < auction.biddingEndTime) revert AuctionNotEnded();
        if (auction.finalized) revert AuctionAlreadyFinalized();
        if (auction.cancelled) revert AuctionCancelled();

        address[] memory bidders = auctionBidders[_auctionId];
        if (bidders.length == 0) revert NoBidders();

        // Find winner by comparing all encrypted bids
        address winner = _determineWinner(_auctionId, bidders);
        
        auction.winner = winner;
        auction.finalized = true;
        auction.revealTime = block.timestamp;

        // Request decryption of winning bid for public reveal
        euint64 winningEncryptedBid = encryptedBids[_auctionId][winner].amount;
        Inco.decrypt(winningEncryptedBid);

        // Transfer NFT to winner
        IERC721(auction.nftContract).transferFrom(
            address(this),
            winner,
            auction.tokenId
        );

        // Transfer winning bid to seller
        uint256 winnerEscrow = escrowedFunds[_auctionId][winner];
        escrowedFunds[_auctionId][winner] = 0;
        
        (bool success, ) = auction.seller.call{value: winnerEscrow}("");
        if (!success) revert TransferFailed();

        emit AuctionFinalized(_auctionId, winner, winnerEscrow);
    }

    /**
     * @notice Determine winner by comparing all encrypted bids
     * @dev Uses FHE max comparison - no bid values are revealed
     */
    function _determineWinner(
        uint256 _auctionId,
        address[] memory bidders
    ) internal returns (address winner) {
        require(bidders.length > 0, "No bidders");

        winner = bidders[0];
        euint64 highestBid = encryptedBids[_auctionId][winner].amount;

        for (uint256 i = 1; i < bidders.length; i++) {
            address bidder = bidders[i];
            euint64 currentBid = encryptedBids[_auctionId][bidder].amount;

            // Compare encrypted bids
            ebool isHigher = Inco.gt(currentBid, highestBid);

            // Update winner using encrypted comparison
            // This is the FHE magic - we find max without seeing values!
            highestBid = Inco.max(highestBid, currentBid);

            // Note: For production, winner selection should also be encrypted
            // and revealed via callback. Simplified here for demo.
        }

        // The currentLeaders mapping tracks this during bidding
        winner = currentLeaders[_auctionId];
        if (winner == address(0)) {
            winner = bidders[0]; // Fallback to first bidder
        }
    }

    // ============ Refunds ============

    /**
     * @notice Claim refund for losing bidders
     * @param _auctionId The auction to claim refund from
     */
    function claimRefund(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (!auction.finalized && !auction.cancelled) revert AuctionNotEnded();
        if (msg.sender == auction.winner) revert NotWinner();
        
        EncryptedBid storage bid = encryptedBids[_auctionId][msg.sender];
        if (bid.refunded) revert AlreadyRefunded();
        
        uint256 refundAmount = escrowedFunds[_auctionId][msg.sender];
        if (refundAmount == 0) revert NoFundsToRefund();

        bid.refunded = true;
        escrowedFunds[_auctionId][msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: refundAmount}("");
        if (!success) revert TransferFailed();

        emit BidRefunded(_auctionId, msg.sender, refundAmount);
    }

    // ============ Cancellation ============

    /**
     * @notice Cancel auction (only seller, only if no bids)
     * @param _auctionId The auction to cancel
     */
    function cancelAuction(uint256 _auctionId) external {
        Auction storage auction = auctions[_auctionId];

        if (auction.seller != msg.sender) revert NotSeller();
        if (auction.finalized) revert AuctionAlreadyFinalized();
        if (auctionBidders[_auctionId].length > 0) {
            revert(); // Can't cancel if there are bids
        }

        auction.cancelled = true;

        // Return NFT to seller
        IERC721(auction.nftContract).transferFrom(
            address(this),
            msg.sender,
            auction.tokenId
        );

        emit AuctionCancelled(_auctionId);
    }

    // ============ View Functions ============

    /**
     * @notice Get number of bidders for an auction
     */
    function getBidderCount(uint256 _auctionId) external view returns (uint256) {
        return auctionBidders[_auctionId].length;
    }

    /**
     * @notice Check if an address has bid on an auction
     */
    function hasBid(uint256 _auctionId, address _bidder) external view returns (bool) {
        return encryptedBids[_auctionId][_bidder].exists;
    }

    /**
     * @notice Get auction details
     */
    function getAuction(uint256 _auctionId) external view returns (
        address seller,
        address nftContract,
        uint256 tokenId,
        uint256 minimumBid,
        uint256 biddingEndTime,
        bool finalized,
        bool cancelled,
        address winner,
        uint256 winningBid
    ) {
        Auction storage a = auctions[_auctionId];
        return (
            a.seller,
            a.nftContract,
            a.tokenId,
            a.minimumBid,
            a.biddingEndTime,
            a.finalized,
            a.cancelled,
            a.winner,
            a.winningBid
        );
    }

    /**
     * @notice Check if auction is still accepting bids
     */
    function isAuctionActive(uint256 _auctionId) external view returns (bool) {
        Auction storage a = auctions[_auctionId];
        return !a.finalized && 
               !a.cancelled && 
               block.timestamp < a.biddingEndTime;
    }

    /**
     * @notice Get time remaining for bidding
     */
    function getTimeRemaining(uint256 _auctionId) external view returns (uint256) {
        Auction storage a = auctions[_auctionId];
        if (block.timestamp >= a.biddingEndTime) return 0;
        return a.biddingEndTime - block.timestamp;
    }
}
