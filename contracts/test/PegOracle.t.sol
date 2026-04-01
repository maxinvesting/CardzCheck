// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PegOracle} from "../src/PegOracle.sol";
import {TestBase} from "./utils/TestBase.sol";

contract PegOracleTest is TestBase {
    PegOracle internal oracle;

    bytes32 internal constant SKU_ID = keccak256("SKU-1952-TOPPS-MANTLE");

    uint256 internal constant SIGNER_PK = 0xA11CE;
    address internal signer;

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        oracle = new PegOracle(
            address(this),
            1 hours,
            1_000, // 10%
            2 hours
        );
        oracle.setSigner(signer, true);
        vm.warp(1_710_000_000);
    }

    function testValidSignatureAcceptedAndReplayRejected() public {
        PegOracle.PriceUpdate memory u = _makeUpdate({
            nonce: 1,
            pegPrice: 1_250_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 15 minutes
        });

        oracle.submitPriceUpdate(u, _sign(u));

        PegOracle.PegState memory state = oracle.getState(SKU_ID);
        assertEq(state.pegPrice, 1_250_000, "peg should update");
        assertEq(state.nonce, 1, "nonce should increment");

        bytes memory replaySig = _sign(u);
        vm.expectRevert(abi.encodeWithSelector(PegOracle.InvalidNonce.selector, 2, 1));
        oracle.submitPriceUpdate(u, replaySig);
    }

    function testExpiryRejects() public {
        PegOracle.PriceUpdate memory u = _makeUpdate({
            nonce: 1,
            pegPrice: 900_000,
            observedAt: block.timestamp,
            expiry: block.timestamp - 1
        });

        bytes memory sig = _sign(u);
        vm.expectRevert(abi.encodeWithSelector(PegOracle.ExpiredQuote.selector, u.expiry, block.timestamp));
        oracle.submitPriceUpdate(u, sig);
    }

    function testNonceMustBeMonotonic() public {
        PegOracle.PriceUpdate memory first = _makeUpdate({
            nonce: 1,
            pegPrice: 1_000_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 10 minutes
        });
        oracle.submitPriceUpdate(first, _sign(first));

        PegOracle.PriceUpdate memory skipped = _makeUpdate({
            nonce: 3,
            pegPrice: 1_010_000,
            observedAt: block.timestamp + 1 hours,
            expiry: block.timestamp + 70 minutes
        });

        bytes memory skippedSig = _sign(skipped);
        vm.expectRevert(abi.encodeWithSelector(PegOracle.InvalidNonce.selector, 2, 3));
        oracle.submitPriceUpdate(skipped, skippedSig);
    }

    function testHaltTriggersOnLargeJumpAndBlocksUntilElapsed() public {
        PegOracle.PriceUpdate memory first = _makeUpdate({
            nonce: 1,
            pegPrice: 1_000_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 10 minutes
        });
        oracle.submitPriceUpdate(first, _sign(first));

        vm.warp(block.timestamp + 1 hours);

        PegOracle.PriceUpdate memory largeJump = _makeUpdate({
            nonce: 2,
            pegPrice: 1_300_000, // +30%
            observedAt: block.timestamp,
            expiry: block.timestamp + 10 minutes
        });
        oracle.submitPriceUpdate(largeJump, _sign(largeJump));

        PegOracle.PegState memory halted = oracle.getState(SKU_ID);
        assertEq(halted.halted, true, "sku should be halted after large move");
        assertEq(halted.pegPrice, 1_000_000, "peg should remain unchanged");
        assertEq(halted.nonce, 1, "nonce should not advance on triggered halt");

        PegOracle.PriceUpdate memory blocked = _makeUpdate({
            nonce: 2,
            pegPrice: 1_020_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 10 minutes
        });
        bytes memory blockedSig = _sign(blocked);
        vm.expectRevert(abi.encodeWithSelector(PegOracle.PegHaltedOrTriggered.selector, SKU_ID, halted.haltUntil, false));
        oracle.submitPriceUpdate(blocked, blockedSig);

        vm.warp(halted.haltUntil + 1);

        PegOracle.PriceUpdate memory resume = _makeUpdate({
            nonce: 2,
            pegPrice: 1_050_000,
            observedAt: block.timestamp,
            expiry: block.timestamp + 10 minutes
        });
        oracle.submitPriceUpdate(resume, _sign(resume));

        PegOracle.PegState memory resumed = oracle.getState(SKU_ID);
        assertEq(resumed.halted, false, "sku should auto-unhalt after halt window");
        assertEq(resumed.pegPrice, 1_050_000, "peg should update after halt window");
        assertEq(resumed.nonce, 2, "nonce should continue after halt");
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
                n: 7,
                windowSeconds: 30 days,
                salesHash: keccak256(abi.encodePacked("sorted-sales")),
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
