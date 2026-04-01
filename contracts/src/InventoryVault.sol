// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";

/// @title InventoryVault
/// @notice Minimal ERC1155 inventory contract used by PegMarket.
contract InventoryVault is Ownable {
    error InvalidSender(address sender, address from);
    error InsufficientBalance(address from, uint256 tokenId, uint256 available, uint256 requiredAmount);

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    string private _baseUri;

    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    constructor(address initialOwner, string memory initialUri) Ownable(initialOwner) {
        _baseUri = initialUri;
    }

    function uri(uint256) external view returns (string memory) {
        return _baseUri;
    }

    function setURI(string calldata newUri) external onlyOwner {
        _baseUri = newUri;
        emit URI(newUri, 0);
    }

    function balanceOf(address account, uint256 tokenId) public view returns (uint256) {
        if (account == address(0)) {
            revert ZeroAddress();
        }
        return _balances[tokenId][account];
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, uint256 amount, bytes calldata) external {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        if (msg.sender != from && !isApprovedForAll(from, msg.sender)) {
            revert InvalidSender(msg.sender, from);
        }

        uint256 fromBalance = _balances[tokenId][from];
        if (fromBalance < amount) {
            revert InsufficientBalance(from, tokenId, fromBalance, amount);
        }

        unchecked {
            _balances[tokenId][from] = fromBalance - amount;
        }
        _balances[tokenId][to] += amount;

        emit TransferSingle(msg.sender, from, to, tokenId, amount);
    }

    function mint(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        _mint(to, tokenId, amount);
    }

    function mintSku(address to, bytes32 skuId, uint256 amount) external onlyOwner {
        _mint(to, tokenIdFromSku(skuId), amount);
    }

    function tokenIdFromSku(bytes32 skuId) public pure returns (uint256) {
        // bytes32 -> uint256 is a direct cast and preserves the full 256-bit fingerprint.
        return uint256(skuId);
    }

    function _mint(address to, uint256 tokenId, uint256 amount) internal {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        _balances[tokenId][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, tokenId, amount);
    }
}
