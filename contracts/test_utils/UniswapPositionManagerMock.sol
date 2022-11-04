// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.14;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/test_utils/UniswapPoolMock.sol";

contract UniswapPositionManagerMock {

    uint256 currentTokenId;
    UniswapPoolMock pool;

    constructor(address _pool) {
        pool = UniswapPoolMock(_pool);
    }

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160 _price) external returns (address) {
        pool.setPrice(_price);
        return address(pool);
    }

    function mint(INonfungiblePositionManager.MintParams memory _params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        tokenId = ++currentTokenId;
        liquidity = 100;
        amount0 = _params.amount0Desired;
        amount1 = _params.amount1Desired;
    }

    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams memory _params) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        liquidity = 200;
        amount0 = _params.amount0Desired;
        amount1 = _params.amount1Desired;
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory _params) external payable returns (uint256 amount0, uint256 amount1) {
        amount0 = _params.amount0Min;
        amount1 = _params.amount1Min;
    }

    function collect(INonfungiblePositionManager.CollectParams memory _params) external payable returns (uint256 amount0, uint256 amount1) {
        amount0 = 50;
        amount1 = 55;
    }

    function burn(uint256 tokenId) external payable {}

    function positions(uint256 tokenId) external view returns (
        uint96 nonce, address operator, address token0, address token1, uint24 fee,
        int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1
    ) {
        liquidity = 5;
    }
}
