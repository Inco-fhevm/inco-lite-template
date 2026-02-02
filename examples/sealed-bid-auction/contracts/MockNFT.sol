// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockNFT
 * @notice Simple NFT for testing the auction contract
 */
contract MockNFT is ERC721, Ownable {
    uint256 private _tokenIdCounter;

    constructor() ERC721("MockNFT", "MNFT") Ownable(msg.sender) {}

    /**
     * @notice Mint a new NFT
     * @param to Address to mint to
     * @return tokenId The minted token ID
     */
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _tokenIdCounter++;
        _mint(to, tokenId);
    }

    /**
     * @notice Mint multiple NFTs
     * @param to Address to mint to
     * @param count Number of NFTs to mint
     */
    function batchMint(address to, uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            _mint(to, _tokenIdCounter++);
        }
    }
}
