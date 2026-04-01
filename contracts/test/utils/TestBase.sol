// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 data) external;
    function expectRevert(bytes calldata data) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error AssertEqUint(uint256 a, uint256 b, string message);
    error AssertEqAddress(address a, address b, string message);
    error AssertEqBool(bool a, bool b, string message);
    error AssertTrueFailed(string message);

    function assertEq(uint256 a, uint256 b, string memory message) internal pure {
        if (a != b) {
            revert AssertEqUint(a, b, message);
        }
    }

    function assertEq(address a, address b, string memory message) internal pure {
        if (a != b) {
            revert AssertEqAddress(a, b, message);
        }
    }

    function assertEq(bool a, bool b, string memory message) internal pure {
        if (a != b) {
            revert AssertEqBool(a, b, message);
        }
    }

    function assertTrue(bool condition, string memory message) internal pure {
        if (!condition) {
            revert AssertTrueFailed(message);
        }
    }
}
