// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";

/// @title PegOracle
/// @notice Stores per-SKU hard-peg prices signed by approved off-chain oracle signers.
contract PegOracle is Ownable {
    struct PegState {
        uint256 pegPrice;
        uint256 observedAt;
        uint256 nonce;
        bool halted;
        uint256 haltUntil;
    }

    struct PriceUpdate {
        bytes32 skuId;
        uint256 pegPrice;
        uint256 method;
        uint256 n;
        uint256 windowSeconds;
        bytes32 salesHash;
        uint256 observedAt;
        uint256 expiry;
        uint256 nonce;
    }

    error InvalidSigner(address signer);
    error InvalidSignatureLength(uint256 actualLength);
    error ExpiredQuote(uint256 expiry, uint256 nowTs);
    error InvalidNonce(uint256 expected, uint256 provided);
    error InvalidObservedAt(uint256 observedAt, uint256 maxAllowed);
    error InvalidCadence(uint256 minObservedAt, uint256 providedObservedAt);
    error PegHaltedOrTriggered(bytes32 skuId, uint256 haltUntil, bool triggered);
    error ZeroPegPrice();
    error UnsupportedThreshold(uint256 requiredSigners);

    event SignerSet(address indexed signer, bool approved);
    event PegUpdated(
        bytes32 indexed skuId,
        uint256 pegPrice,
        uint256 observedAt,
        uint256 nonce,
        bytes32 salesHash,
        uint256 n,
        uint256 windowSeconds
    );
    event Halted(
        bytes32 indexed skuId,
        uint256 previousPeg,
        uint256 attemptedPeg,
        uint256 bpsChange,
        uint256 haltUntil,
        uint256 observedAt,
        uint256 nonce
    );

    string public constant NAME = "CardzCheckPegOracle";
    string public constant VERSION = "1";

    bytes32 public constant PRICE_UPDATE_TYPEHASH = keccak256(
        "PriceUpdate(bytes32 skuId,uint256 pegPrice,uint256 method,uint256 n,uint256 windowSeconds,bytes32 salesHash,uint256 observedAt,uint256 expiry,uint256 nonce)"
    );

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256(bytes(NAME));
    bytes32 private constant VERSION_HASH = keccak256(bytes(VERSION));

    uint256 public immutable MIN_SECONDS_BETWEEN_UPDATES;
    uint256 public immutable MAX_BPS_CHANGE;
    uint256 public immutable HALT_SECONDS;
    uint256 public constant OBSERVATION_FUTURE_TOLERANCE = 5 minutes;

    /// @notice v1 keeps threshold at 1 signature but storage layout allows future M-of-N extension.
    uint256 public requiredSigners = 1;

    mapping(address => bool) public approvedSigner;
    mapping(bytes32 => PegState) private _states;

    constructor(
        address initialOwner,
        uint256 minSecondsBetweenUpdates,
        uint256 maxBpsChange,
        uint256 haltSeconds
    ) Ownable(initialOwner) {
        MIN_SECONDS_BETWEEN_UPDATES = minSecondsBetweenUpdates;
        MAX_BPS_CHANGE = maxBpsChange;
        HALT_SECONDS = haltSeconds;
    }

    function setSigner(address signer, bool approved) external onlyOwner {
        approvedSigner[signer] = approved;
        emit SignerSet(signer, approved);
    }

    /// @notice Placeholder hook for M-of-N expansion. v1 enforces exactly 1 signer.
    function setRequiredSigners(uint256 newRequiredSigners) external onlyOwner {
        if (newRequiredSigners != 1) {
            revert UnsupportedThreshold(newRequiredSigners);
        }
        requiredSigners = newRequiredSigners;
    }

    /// @notice Returns current peg state for SKU.
    function getState(bytes32 skuId) external view returns (PegState memory) {
        return _states[skuId];
    }

    /// @notice Returns peg tuple for convenience reads.
    function getPeg(bytes32 skuId) external view returns (uint256 pegPrice, uint256 observedAt, uint256 nonce) {
        PegState memory state = _states[skuId];
        return (state.pegPrice, state.observedAt, state.nonce);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function hashPriceUpdate(PriceUpdate calldata u) external view returns (bytes32) {
        return _hashTypedDataV4(u);
    }

    /// @notice Submits one signed oracle price update for a SKU.
    function submitPriceUpdate(PriceUpdate calldata u, bytes calldata sig) external {
        PegState storage state = _states[u.skuId];

        if (state.halted) {
            if (block.timestamp < state.haltUntil) {
                revert PegHaltedOrTriggered(u.skuId, state.haltUntil, false);
            }
            state.halted = false;
            state.haltUntil = 0;
        }

        if (block.timestamp > u.expiry) {
            revert ExpiredQuote(u.expiry, block.timestamp);
        }
        if (u.pegPrice == 0) {
            revert ZeroPegPrice();
        }
        if (u.nonce != state.nonce + 1) {
            revert InvalidNonce(state.nonce + 1, u.nonce);
        }
        if (u.observedAt > block.timestamp + OBSERVATION_FUTURE_TOLERANCE) {
            revert InvalidObservedAt(u.observedAt, block.timestamp + OBSERVATION_FUTURE_TOLERANCE);
        }

        address signer = _recoverSigner(u, sig);
        if (!approvedSigner[signer]) {
            revert InvalidSigner(signer);
        }

        if (state.observedAt != 0) {
            uint256 minObservedAt = state.observedAt + MIN_SECONDS_BETWEEN_UPDATES;
            if (u.observedAt < minObservedAt) {
                revert InvalidCadence(minObservedAt, u.observedAt);
            }

            uint256 bpsChange = (_absDiff(state.pegPrice, u.pegPrice) * 10_000) / state.pegPrice;
            if (bpsChange > MAX_BPS_CHANGE) {
                uint256 haltUntil = block.timestamp + HALT_SECONDS;
                state.halted = true;
                state.haltUntil = haltUntil;
                emit Halted(
                    u.skuId,
                    state.pegPrice,
                    u.pegPrice,
                    bpsChange,
                    haltUntil,
                    u.observedAt,
                    u.nonce
                );
                // Cannot both persist halt state and revert in the same transaction.
                // We keep the halt state and skip peg update.
                return;
            }
        }

        state.pegPrice = u.pegPrice;
        state.observedAt = u.observedAt;
        state.nonce = u.nonce;

        emit PegUpdated(
            u.skuId,
            u.pegPrice,
            u.observedAt,
            u.nonce,
            u.salesHash,
            u.n,
            u.windowSeconds
        );
    }

    function _recoverSigner(PriceUpdate calldata u, bytes calldata sig) internal view returns (address signer) {
        if (sig.length != 65) {
            revert InvalidSignatureLength(sig.length);
        }

        bytes32 digest = _hashTypedDataV4(u);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }

        signer = ecrecover(digest, v, r, s);
    }

    function _hashTypedDataV4(PriceUpdate calldata u) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                PRICE_UPDATE_TYPEHASH,
                u.skuId,
                u.pegPrice,
                u.method,
                u.n,
                u.windowSeconds,
                u.salesHash,
                u.observedAt,
                u.expiry,
                u.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _absDiff(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a - b : b - a;
    }
}
