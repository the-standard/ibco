//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract SEuroRateCalculator {
    address private bondingCurve;
        
    constructor(address _bondingCurve) {
        bondingCurve = _bondingCurve;
    }

    function calculate() external view returns (uint256) {

    }
}