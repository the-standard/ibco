//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;
    uint256 public constant FINAL_PRICE = 1_000_000_000_000_000_000;
    uint128 constant MIN_SUPPLY = 1;

    uint256 private immutable initialPrice;
    uint256 private immutable maxSupply;
    uint256 private immutable k;
    int128 private immutable minSupplyMaxSupply;
    int128 private immutable y;
    address private immutable seuro;

    constructor(address _seuro, uint256 _initialPrice, uint256 _maxSupply) {
        seuro = _seuro;
        initialPrice = _initialPrice;
        maxSupply = _maxSupply;
        k = FINAL_PRICE - initialPrice;
        minSupplyMaxSupply = ABDKMath64x64.divu(MIN_SUPPLY, maxSupply);
        y = ABDKMath64x64.divu(301, 1000);
    }

    function pricePerEuro() public view returns (uint256) {
        uint256 supply = SEuro(seuro).totalSupply();
        if (supply == 0) {
            return initialPrice;
        }
        int128 supplyMaxSupply = ABDKMath64x64.divu(supply, maxSupply);
        int128 x = ABDKMath64x64.sub(supplyMaxSupply, minSupplyMaxSupply);
        int128 log2_x = ABDKMath64x64.log_2(x);
        int128 y_log2_x = ABDKMath64x64.mul(y, log2_x);
        int128 baseCurve = ABDKMath64x64.exp_2(y_log2_x);
        uint256 kBaseCurve = ABDKMath64x64.mulu(baseCurve, k);
        return kBaseCurve + initialPrice;
    }
}
