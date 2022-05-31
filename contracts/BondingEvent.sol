//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";

contract BondingEvent {
    INonfungiblePositionManager private immutable manager;
    address public immutable tokenA;
    address public immutable tokenB;
    address public pool;
    int24 public tickSpacing;

    constructor(address _tokenA, address _tokenB, address _manager) {
        (tokenA, tokenB) = _tokenA < _tokenB ?
            (_tokenA, _tokenB) :
            (_tokenB, _tokenA);

        manager = INonfungiblePositionManager(_manager);
    }
}
