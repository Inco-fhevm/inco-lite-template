// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {inco, e, ebool, euint256} from "@inco/lightning/src/Lib.devnet.sol";
import {asBool} from "@inco/lightning/src/shared/TypeUtils.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract ConfidentialERC20 is Ownable2Step {
    // Errors
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidDecryptionAttestation();
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

    // Helper function to verify if the balance is enough
    function _verifyEnoughBalance(
        address owner,
        euint256 amount,
        DecryptionAttestation memory att
    ) internal returns (bool) {
        if (
            ebool.unwrap(e.ge(balances[owner], amount)) != att.handle ||
            !asBool(att.value)
        ) {
            revert InsufficientBalance();
        }
        return true;
    }

    // Helper function to verify if the allowance is enough
    function _verifyEnoughAllowance(
        address owner,
        address spender,
        euint256 amount,
        DecryptionAttestation memory att
    ) internal returns (bool) {
        if (
            ebool.unwrap(e.ge(allowances[owner][spender], amount)) !=
            att.handle ||
            !asBool(att.value)
        ) {
            revert InsufficientAllowance();
        }
        return true;
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
        bytes calldata encryptedAmount,
        DecryptionAttestation memory enoughBalanceAttestation,
        bytes[] memory enoughBalanceSignature
    ) public payable virtual returns (bool) {
        _requireFee();
        transfer(
            to,
            e.newEuint256(encryptedAmount, msg.sender),
            enoughBalanceAttestation,
            enoughBalanceSignature
        );
        return true;
    }

    // Transfer function for contracts
    function transfer(
        address to,
        euint256 amount,
        DecryptionAttestation memory enoughBalanceAttestation,
        bytes[] memory enoughBalanceSignature
    ) public virtual returns (bool) {
        e.allow(amount, address(this));
        require(
            inco.incoVerifier().isValidDecryptionAttestation(
                enoughBalanceAttestation,
                enoughBalanceSignature
            ),
            InvalidDecryptionAttestation()
        );

        require(
            ebool.unwrap(e.ge(balanceOf(msg.sender), amount)) ==
                enoughBalanceAttestation.handle,
            InsufficientBalance()
        );
        require(
            asBool(enoughBalanceAttestation.value) == true,
            InsufficientBalance()
        );

        _transfer(msg.sender, to, amount);
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
        bytes calldata encryptedAmount,
        DecryptionAttestation memory enoughBalanceAttestation,
        DecryptionAttestation memory enoughAllowanceAttestation,
        bytes[] memory enoughBalanceSignature,
        bytes[] memory enoughAllowanceSignature
    ) public virtual returns (bool) {
        transferFrom(
            from,
            to,
            e.newEuint256(encryptedAmount, msg.sender),
            enoughBalanceAttestation,
            enoughAllowanceAttestation,
            enoughBalanceSignature,
            enoughAllowanceSignature
        );
        return true;
    }

    // TransferFrom function for contracts
    function transferFrom(
        address from,
        address to,
        euint256 amount,
        DecryptionAttestation memory enoughBalanceAttestation,
        DecryptionAttestation memory enoughAllowanceAttestation,
        bytes[] memory enoughBalanceSignature,
        bytes[] memory enoughAllowanceSignature
    ) public virtual returns (bool) {
        e.allow(amount, address(this));

        require(
            inco.incoVerifier().isValidDecryptionAttestation(
                enoughBalanceAttestation,
                enoughBalanceSignature
            ),
            InvalidDecryptionAttestation()
        );

        require(
            inco.incoVerifier().isValidDecryptionAttestation(
                enoughAllowanceAttestation,
                enoughAllowanceSignature
            ),
            InvalidDecryptionAttestation()
        );

        require(
            ebool.unwrap(e.ge(balanceOf(from), amount)) ==
                enoughBalanceAttestation.handle,
            InsufficientBalance()
        );
        require(
            asBool(enoughBalanceAttestation.value) == true,
            InsufficientBalance()
        );

        require(
            ebool.unwrap(e.ge(_allowance(from, msg.sender), amount)) ==
                enoughAllowanceAttestation.handle,
            InsufficientAllowance()
        );
        require(
            asBool(enoughAllowanceAttestation.value) == true,
            InsufficientAllowance()
        );

        _approve(from, msg.sender, e.sub(_allowance(from, msg.sender), amount));
        _transfer(from, to, amount);
        return true;
    }

    // Internal transfer function for encrypted token transfer
    function _transfer(
        address from,
        address to,
        euint256 amount
    ) internal virtual {
        euint256 newBalanceTo = e.add(balances[to], amount);
        balances[to] = newBalanceTo;
        e.allow(newBalanceTo, address(this));
        e.allow(newBalanceTo, to);

        euint256 newBalanceFrom = e.sub(balances[from], amount);
        balances[from] = newBalanceFrom;
        e.allow(newBalanceFrom, address(this));
        e.allow(newBalanceFrom, from);

        emit Transfer(from, to, amount);
    }

    
}
