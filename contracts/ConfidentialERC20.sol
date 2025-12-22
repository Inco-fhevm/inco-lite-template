// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {inco, e, ebool, euint256} from "@inco/lightning/src/Lib.devnet.sol";
import {asBool} from "@inco/lightning/src/shared/TypeUtils.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract ConfidentialERC20 is Ownable2Step {
    // Errors
    error InsufficientFees();

    // Events
    event Transfer(address indexed from, address indexed to, euint256 amount);
    event Approval(
        address indexed owner,
        address indexed spender,
        euint256 amount
    );
    event Mint(address indexed to, uint256 amount);
    event EncryptedMint(address indexed to, euint256 amount);

    // State variables
    euint256 public totalSupply;
    string public _name;
    string public _symbol;
    uint8 public constant decimals = 18;

    // Mappings for balances and allowances
    mapping(address => euint256) internal balances;
    mapping(address => mapping(address => euint256)) internal allowances;

    // Constructor to set the token name, symbol, and owner
    constructor() Ownable(msg.sender) {
        _name = "Confidential USD";
        _symbol = "cUSD";
    }

    // Helper functions
    function _requireFee() internal view {
        if (msg.value < inco.getFee()) revert InsufficientFees();
    }

    // Mint function to create tokens and add to the owner's balance
    function mint(uint256 mintAmount) public virtual onlyOwner {
        euint256 amount = e.asEuint256(mintAmount);
        balances[owner()] = e.add(balances[owner()], amount);
        e.allow(balances[owner()], address(this));
        e.allow(balances[owner()], owner());
        
        totalSupply = e.add(totalSupply, amount);
        e.reveal(totalSupply);
        emit Mint(owner(), mintAmount);
    }

    // Encrypted mint function to create tokens and add to the sender's balance
    function encryptedMint(
        bytes calldata encryptedAmount
    ) public payable virtual /*onlyOwner*/ {
        _requireFee();
        euint256 amount = e.newEuint256(encryptedAmount, msg.sender);
        e.allow(amount, address(this));
        if(euint256.unwrap(balances[msg.sender]) == bytes32(0)) {
            balances[msg.sender] = amount;
        } else {
            balances[msg.sender] = e.add(balances[msg.sender], amount);
        }
        e.allow(balances[msg.sender], address(this));
        e.allow(balances[msg.sender], owner());
        e.allow(balances[msg.sender], msg.sender);

        totalSupply = e.add(totalSupply, amount);
        e.reveal(totalSupply);
        emit EncryptedMint(msg.sender, amount);
    }

    // Transfer function for EOAs using encrypted inputs
    function transfer(
        address to,
        bytes calldata encryptedAmount
    ) public payable virtual returns (bool) {
        _requireFee();
        transfer(
            to,
            e.newEuint256(encryptedAmount, msg.sender)
        );
        return true;
    }

    // Transfer function for contracts
    function transfer(
        address to,
        euint256 amount
    ) public virtual returns (bool) {
        e.allow(amount, address(this));
        ebool canTransfer = e.ge(balances[msg.sender], amount);

        _transfer(msg.sender, to, amount, canTransfer);
        return true;
    }

    // Retrieves the balance handle of a specified wallet
    function balanceOf(address wallet) public view virtual returns (euint256) {
        return balances[wallet];
    }

    // Retrieves the total supply handle
    function getTotalSupply() public view virtual returns (euint256) {
        return totalSupply;
    }

    // Approve function for EOAs with encrypted inputs
    function approve(
        address spender,
        bytes calldata encryptedAmount
    ) public payable virtual returns (bool) {
        _requireFee();
        approve(spender, e.newEuint256(encryptedAmount, msg.sender));
        return true;
    }

    // Approve function for contracts
    function approve(
        address spender,
        euint256 amount
    ) public virtual returns (bool) {
        _approve(msg.sender, spender, amount);
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // Internal function to handle allowance approvals
    function _approve(
        address owner,
        address spender,
        euint256 amount
    ) internal virtual {
        allowances[owner][spender] = amount;
        e.allow(amount, address(this));
        e.allow(amount, owner);
        e.allow(amount, spender);
    }

    // Retrieves the allowance handle for a spender
    function allowance(
        address owner,
        address spender
    ) public view virtual returns (euint256) {
        return _allowance(owner, spender);
    }

    // Internal function to retrieve an allowance handle
    function _allowance(
        address owner,
        address spender
    ) internal view virtual returns (euint256) {
        return allowances[owner][spender];
    }

    // TransferFrom function for EOAs with encrypted inputs
    function transferFrom(
        address from,
        address to,
        bytes calldata encryptedAmount
    ) public payable virtual returns (bool) {
        _requireFee();
        transferFrom(
            from,
            to,
            e.newEuint256(encryptedAmount, msg.sender)
        );
        return true;
    }

    // TransferFrom function for contracts
    function transferFrom(
        address from,
        address to,
        euint256 amount
    ) public virtual returns (bool) {
        e.allow(amount, address(this));

        ebool isTransferable = _updateAllowance(from, msg.sender, amount);
        _transfer(from, to, amount, isTransferable);
        return true;
    }

    function _updateAllowance(
        address owner,
        address spender,
        euint256 amount
    ) internal virtual returns (ebool) {
        euint256 currentAllowance = _allowance(owner, spender);
        ebool allowedTransfer = e.ge(currentAllowance, amount);
        ebool canTransfer = e.ge(balances[owner], amount);
        ebool isTransferable = e.select(
            canTransfer,
            allowedTransfer,
            e.asEbool(false)
        );
        _approve(
            owner,
            spender,
            e.select(
                isTransferable,
                e.sub(currentAllowance, amount),
                currentAllowance
            )
        );
        return isTransferable;
    }

    // Internal transfer function for encrypted token transfer
    function _transfer(
        address from,
        address to,
        euint256 amount,
        ebool isTransferable
    ) internal virtual {
        euint256 transferValue = e.select(
            isTransferable,
            amount,
            e.asEuint256(0)
        );

        if(euint256.unwrap(balances[to]) == bytes32(0)) {
            balances[to] = transferValue;
        } else {
            balances[to] = e.add(balances[to], transferValue);
        }

        e.allow(balances[to], address(this));
        e.allow(balances[to], to);

        balances[from] = e.sub(balances[from], transferValue);
        e.allow(balances[from], address(this));
        e.allow(balances[from], from);

        emit Transfer(from, to, transferValue);
    }
    
}
