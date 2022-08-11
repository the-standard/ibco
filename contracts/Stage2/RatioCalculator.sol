// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

contract RatioCalculator {

    // Gets required amount of a second asset to provide liquidity, 
    // Calculates using given amount of sEURO, the current price, the lower and upper ticks of the position range, and whether sEURO is token0 in pool
    /// @param _amountSEuro the amount of sEURO token to bond
    /// @param _price the current price of the pool as a sqrtPriceX96 (https://docs.uniswap.org/sdk/guides/fetching-prices#understanding-sqrtprice)
    /// @param _lowerTick the lower tick of the potential position range
    /// @param _upperTick the upper tick of the potential position range
    /// @param _seuroIsToken0 whether sEURO is token0 of the liquidity pool
    function getRatioForSEuro(uint256 _amountSEuro, uint160 _price, int24 _lowerTick, int24 _upperTick, bool _seuroIsToken0) external pure returns (uint256) {
        uint160 lower = TickMath.getSqrtRatioAtTick(_lowerTick);
        uint160 upper = TickMath.getSqrtRatioAtTick(_upperTick);
        return _seuroIsToken0 ?
            getToken1Amount(_amountSEuro, _price, lower, upper) :
            getToken0Amount(_amountSEuro, _price, lower, upper);
    }

    function getToken0Amount(uint256 _amountSEuro, uint160 _price, uint160 _lower, uint160 _upper) private pure returns (uint256) {
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(_lower, _price, _amountSEuro);
        return LiquidityAmounts.getAmount0ForLiquidity(_price, _upper, liquidity);
    }

    function getToken1Amount(uint256 _amountSEuro, uint160 _price, uint160 _lower, uint160 _upper) private pure returns (uint256) {
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount0(_price, _upper, _amountSEuro);
        return LiquidityAmounts.getAmount1ForLiquidity(_lower, _price, liquidity);
    }

    function getTickAt(uint160 _price) external pure returns (int24) {
        return TickMath.getTickAtSqrtRatio(_price);
    }
}
