//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/SEuro.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1 ether;
    uint256 constant INITIAL_PRICE = 7 ether / 10;
    uint8 constant MIN_SUPPLY = 1;
    uint256 constant MAX_SUPPLY = 200_000_000;
    uint256 constant K = 3 ether / 10;
    address private seuro;

    event Log(uint256);
        
    constructor(address _seuro) {
        seuro = _seuro;
    }

    // do we care about the price per euro, or do we need a function that returns the area under the curve for the amount purchased?
    // do we need both? to give the current discount
    // if we need area under the curve, we need to find integral of function, which is probably even worse to calculate in solidity
    function pricePerEuro() public view returns (uint256) {
        uint256 supply = SEuro(seuro).totalSupply();
        // yeah what are we gonna do about this
        // 
        // return K * (supply / MAX_SUPPLY - MIN_SUPPLY / MAX_SUPPLY) ^ (1 / 5) + INITIAL_PRICE;
        return INITIAL_PRICE;
    }
}
