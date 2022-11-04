// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.14;

import "contracts/uniswap/INonfungiblePositionManager.sol";

contract UniswapPoolMock {
    uint160 price;

    function setPrice(uint160 _price) external {
        price = _price;
    }

    function tickSpacing() external pure returns (int24) { return 10; }

    function slot0() external view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool) {
        sqrtPriceX96 = price;
    }
}