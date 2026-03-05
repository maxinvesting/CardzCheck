// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {InventoryVault} from "../src/InventoryVault.sol";
import {PegOracle} from "../src/PegOracle.sol";
import {PegMarket} from "../src/PegMarket.sol";

contract PegMarketTest is TestBase {
    bytes32 internal constant SKU_ID = keccak256("SKU-1986-FLEER-JORDAN-57");

    uint256 internal constant SIGNER_PK = 0xB0B;

    address internal signer;
    address internal buyer = address(0xBEEF);
    address internal treasury = address(0xCAFE);

    MockUSDC internal usdc;
    InventoryVault internal vault;
    PegOracle internal oracle;
    PegMarket internal market;

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        vm.warp(1_710_100_000);

        usdc = new MockUSDC(address(this));
        vault = new InventoryVault(address(this), "https://cardzcheck.local/metadata/{id}.json");
        oracle = new PegOracle(address(this), 1 hours, 1_000, 2 hours);
        market = new PegMarket(address(this), address(oracle), address(vault), address(usdc), treasury);

        oracle.setSigner(signer, true);

        vault.mint(address(market), uint256(SKU_ID), 10);
        usdc.mint(buyer, 50_000_000);

        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);

        PegOracle.PriceUpdate memory update = _makeUpdate({
            nonce: 1,
            pegPrice: 1_250_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 20 minutes
        });
        oracle.submitPriceUpdate(update, _sign(update));
    }

    function testBuyAtPegTransfersUsdcAndInventory() public {
        uint256 qty = 2;
        uint256 expectedTotal = 2_500_000;

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(buyer);
        market.buy(SKU_ID, qty, expectedTotal);

        assertEq(usdc.balanceOf(treasury), treasuryBefore + expectedTotal, "treasury should receive payment");
        assertEq(usdc.balanceOf(buyer), buyerBefore - expectedTotal, "buyer should pay peg total");
        assertEq(vault.balanceOf(buyer, uint256(SKU_ID)), qty, "buyer should receive inventory units");
        assertEq(vault.balanceOf(address(market), uint256(SKU_ID)), 8, "market inventory should decrement");
    }

    function testBuyRevertsIfMaxTotalBelowPeg() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PegMarket.SlippageExceeded.selector, 1_250_000, 1_000_000));
        market.buy(SKU_ID, 1, 1_000_000);
    }

    function _makeUpdate(
        uint256 nonce,
        uint256 pegPrice,
        uint256 observedAt,
        uint256 expiry
    ) internal pure returns (PegOracle.PriceUpdate memory) {
        return
            PegOracle.PriceUpdate({
                skuId: SKU_ID,
                pegPrice: pegPrice,
                method: 1,
                n: 5,
                windowSeconds: 30 days,
                salesHash: keccak256(abi.encodePacked("sales-bucket")),
                observedAt: observedAt,
                expiry: expiry,
                nonce: nonce
            });
    }

    function _sign(PegOracle.PriceUpdate memory u) internal returns (bytes memory) {
        bytes32 digest = oracle.hashPriceUpdate(u);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);
        return abi.encodePacked(r, s, v);
    }
}
