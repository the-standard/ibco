//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;
    uint256 constant INITIAL_PRICE = 700_000_000_000_000_000;
    uint128 constant MIN_SUPPLY = 1;
    uint128 constant MAX_SUPPLY = 200_000_000;
    uint256 constant K = 300_000_000_000_000_000;

    int128 private minSupplyMaxSupply;
    int128 private y;
    address private seuro;

    constructor(address _seuro) {
        seuro = _seuro;
        calculateConstants();
    }

    function calculateConstants() private {
        minSupplyMaxSupply = ABDKMath64x64.divu(MIN_SUPPLY, MAX_SUPPLY);
        y = ABDKMath64x64.divu(301, 1000);
    }

    function pricePerEuro() public view returns (uint256) {
        uint256 supply = SEuro(seuro).totalSupply();
        if (supply == 0) {
            return INITIAL_PRICE;
        }
        int128 supplyMaxSupply = ABDKMath64x64.divu(supply, MAX_SUPPLY);
        int128 x = ABDKMath64x64.sub(supplyMaxSupply, minSupplyMaxSupply);
        int128 log2_x = ABDKMath64x64.log_2(x);
        int128 y_log2_x = ABDKMath64x64.mul(y, log2_x);
        int128 baseCurve = ABDKMath64x64.exp_2(y_log2_x);
        uint256 kBaseCurve = ABDKMath64x64.mulu(baseCurve, K);
        return kBaseCurve + INITIAL_PRICE;
    }
}
