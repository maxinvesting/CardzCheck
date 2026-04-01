// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {InventoryVault} from "../src/InventoryVault.sol";
import {PegOracle} from "../src/PegOracle.sol";
import {PegMarket} from "../src/PegMarket.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Forge script entrypoint. Run with:
/// forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
contract Deploy {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event Deployed(
        address indexed deployer,
        address usdc,
        address inventoryVault,
        address pegOracle,
        address pegMarket
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address oracleSigner = vm.envAddress("ORACLE_SIGNER");
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast(privateKey);

        MockUSDC usdc = new MockUSDC(deployer);
        InventoryVault vault = new InventoryVault(deployer, "https://cardzcheck.local/metadata/{id}.json");
        PegOracle oracle = new PegOracle(
            deployer,
            1 hours,
            1_500, // 15%
            6 hours
        );
        PegMarket market = new PegMarket(deployer, address(oracle), address(vault), address(usdc), treasury);

        oracle.setSigner(oracleSigner, true);

        vm.stopBroadcast();

        emit Deployed(deployer, address(usdc), address(vault), address(oracle), address(market));
    }
}
