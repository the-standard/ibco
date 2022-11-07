// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.14;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/test_utils/UniswapPoolMock.sol";

contract UniswapPositionManagerMock {
    uint128 public constant LIQUIDITY = 100;

    uint256 public currentTokenId;
    UniswapPoolMock public pool;
    uint256 public excess;
    uint256 public amount0;
    uint256 public amount1;

    constructor(address _pool) {
        pool = UniswapPoolMock(_pool);
    }

    function stubExcess(uint256 _excess) external {
        excess = _excess;
    }

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160 _price) external returns (address) {
        pool.setPrice(_price);
        return address(pool);
    }

    function mint(INonfungiblePositionManager.MintParams memory _params) external payable returns (uint256 _tokenId, uint128 _liquidity, uint256 _amount0, uint256 _amount1) {
        _tokenId = ++currentTokenId;
        _liquidity = LIQUIDITY;
        amount0 = _params.amount0Desired - excess;
        amount1 = _params.amount1Desired - excess;
        _amount0 = amount0;
        _amount1 = amount1;
    }

    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams memory _params) external payable returns (uint128 _liquidity, uint256 _amount0, uint256 _amount1) {
        _liquidity = LIQUIDITY;
        _amount0 = _params.amount0Desired - excess;
        _amount1 = _params.amount1Desired - excess;
        amount0 += _amount0;
        amount1 += _amount1;
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory) external payable returns (uint256 _amount0, uint256 _amount1) {
        _amount0 = amount0;
        _amount1 = amount1;
    }

    function collect(INonfungiblePositionManager.CollectParams memory) external payable returns (uint256, uint256) {}

    function burn(uint256) external payable {}

    function positions(uint256 tokenId) external view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128) {}
}
