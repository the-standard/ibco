//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1 ether;
    uint256 constant INITIAL_PRICE = 700_000_000_000_000_000;
    uint128 constant MIN_SUPPLY = 1;
    uint128 constant MAX_SUPPLY = 200_000_000;
    uint256 constant K = 300_000_000_000_000_000;
    address private seuro;

    event Log(uint256);
        
    constructor(address _seuro) {
        seuro = _seuro;
    }

    // do we care about the price per euro, or do we need a function that returns the area under the curve for the amount purchased?
    // do we need both? to give the current discount
    // if we need area under the curve, we need to find integral of function, which is probably even worse to calculate in solidity
    function pricePerEuro() public view returns (uint256) {
        // // return K * (supply / MAX_SUPPLY - MIN_SUPPLY / MAX_SUPPLY) ^ (1 / 5) + INITIAL_PRICE;
        uint256 supply = SEuro(seuro).totalSupply();
        int128 supplyMaxSupply = ABDKMath64x64.divu(supply, MAX_SUPPLY);
        int128 minSupplyMaxSupply = ABDKMath64x64.divu(MIN_SUPPLY, MAX_SUPPLY);
        int128 x = ABDKMath64x64.sub(supplyMaxSupply, minSupplyMaxSupply);
        int128 log2_x = ABDKMath64x64.log_2(x);
        int128 y = ABDKMath64x64.divu(301, 1000);
        int128 y_log2_x = ABDKMath64x64.mul(y, log2_x);
        int128 baseCurve = ABDKMath64x64.exp_2(y_log2_x);
        uint256 kBaseCurve = ABDKMath64x64.mulu(baseCurve, K);
        return kBaseCurve + INITIAL_PRICE;
    }
}
