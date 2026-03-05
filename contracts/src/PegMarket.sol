// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";
import {PegOracle} from "./PegOracle.sol";
import {InventoryVault} from "./InventoryVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @title PegMarket
/// @notice Buy-only market that executes trades strictly at the oracle-enforced peg.
contract PegMarket is Ownable {
    error InvalidQuantity();
    error PegUnavailable(bytes32 skuId);
    error SKUHalted(bytes32 skuId, uint256 haltUntil);
    error SlippageExceeded(uint256 total, uint256 maxTotal);
    error InsufficientInventory(uint256 tokenId, uint256 available, uint256 requiredAmount);
    error PaymentTransferFailed();

    event Trade(bytes32 indexed skuId, uint256 qty, uint256 pegPrice, uint256 total, address indexed buyer);
    event TreasurySet(address indexed previousTreasury, address indexed newTreasury);
    event InventoryDeposited(bytes32 indexed skuId, uint256 qty);
    event USDCWithdrawn(address indexed to, uint256 amount);

    PegOracle public immutable pegOracle;
    InventoryVault public immutable inventoryVault;
    MockUSDC public immutable usdc;

    address public treasury;

    constructor(
        address initialOwner,
        address pegOracle_,
        address inventoryVault_,
        address usdc_,
        address treasury_
    ) Ownable(initialOwner) {
        if (pegOracle_ == address(0) || inventoryVault_ == address(0) || usdc_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        pegOracle = PegOracle(pegOracle_);
        inventoryVault = InventoryVault(inventoryVault_);
        usdc = MockUSDC(usdc_);
        treasury = treasury_;
    }

    /// @notice Buy market inventory at the current exact peg price.
    /// @param skuId The sku fingerprint (bytes32).
    /// @param qty Number of ERC1155 units to buy.
    /// @param maxTotal Slippage guard; tx reverts if peg*qty exceeds this value.
    function buy(bytes32 skuId, uint256 qty, uint256 maxTotal) external {
        if (qty == 0) {
            revert InvalidQuantity();
        }

        PegOracle.PegState memory state = pegOracle.getState(skuId);
        if (state.halted && block.timestamp < state.haltUntil) {
            revert SKUHalted(skuId, state.haltUntil);
        }
        if (state.pegPrice == 0) {
            revert PegUnavailable(skuId);
        }

        uint256 total = state.pegPrice * qty;
        if (total > maxTotal) {
            revert SlippageExceeded(total, maxTotal);
        }

        uint256 tokenId = uint256(skuId);
        uint256 available = inventoryVault.balanceOf(address(this), tokenId);
        if (available < qty) {
            revert InsufficientInventory(tokenId, available, qty);
        }

        bool transferred = usdc.transferFrom(msg.sender, treasury, total);
        if (!transferred) {
            revert PaymentTransferFailed();
        }

        inventoryVault.safeTransferFrom(address(this), msg.sender, tokenId, qty, "");

        emit Trade(skuId, qty, state.pegPrice, total, msg.sender);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert ZeroAddress();
        }
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasurySet(previousTreasury, newTreasury);
    }

    /// @notice Pull USDC held by market to treasury (e.g. accidental transfers).
    function withdrawUSDC() external onlyOwner {
        uint256 amount = usdc.balanceOf(address(this));
        if (amount == 0) {
            return;
        }
        bool ok = usdc.transfer(treasury, amount);
        if (!ok) {
            revert PaymentTransferFailed();
        }
        emit USDCWithdrawn(treasury, amount);
    }

    /// @notice Owner deposits inventory from owner wallet into market.
    /// @dev Owner must call InventoryVault.setApprovalForAll(market, true) first.
    function depositInventory(bytes32 skuId, uint256 qty) external onlyOwner {
        if (qty == 0) {
            revert InvalidQuantity();
        }
        inventoryVault.safeTransferFrom(msg.sender, address(this), uint256(skuId), qty, "");
        emit InventoryDeposited(skuId, qty);
    }
}
