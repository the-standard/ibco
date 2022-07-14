// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

import "hardhat/console.sol";

contract RatioCalculator {

    function getRatioForSEuro(uint256 _amountSEuro, uint160 _price, int24 _lowerTick, int24 _upperTick, bool _seuroIsToken0) external view returns (uint256) {
        uint160 lower = TickMath.getSqrtRatioAtTick(_lowerTick);
        uint160 upper = TickMath.getSqrtRatioAtTick(_upperTick);
        return _seuroIsToken0 ?
            getToken1Amount(_amountSEuro, _price, lower, upper) :
            getToken0Amount(_amountSEuro, _price, lower, upper);
    }

    function getToken0Amount(uint256 _amountSEuro, uint160 _price, uint160 _lower, uint160 _upper) private view returns (uint256) {
        // uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(_price, _upper, _amountSEuro);
        // return LiquidityAmounts.getAmount0ForLiquidity(_lower, _price, liquidity);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(_lower, _price, _amountSEuro);
        return LiquidityAmounts.getAmount0ForLiquidity(_price, _upper, liquidity);
    }

    function getToken1Amount(uint256 _amountSEuro, uint160 _price, uint160 _lower, uint160 _upper) private view returns (uint256) {
        // uint128 liquidity = LiquidityAmounts.getLiquidityForAmount0(_lower, _price, _amountSEuro);
        // return LiquidityAmounts.getAmount1ForLiquidity(_price, _upper, liquidity);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount0(_price, _upper, _amountSEuro);
        return LiquidityAmounts.getAmount1ForLiquidity(_lower, _price, liquidity);
    }
}
