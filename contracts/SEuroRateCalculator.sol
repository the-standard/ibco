//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/BondingCurve.sol";
import "contracts/interfaces/Chainlink.sol";

contract SEuroRateCalculator {
    uint8 public constant MULTIPLIER = 5;
    uint256 public constant FIXED_POINT = 1 ether;
    address public constant EUR_USD_CL = 0x73366Fe0AA0Ded304479862808e02506FE556a98;
    uint8 public constant EUR_USD_CL_DEC = 8;

    address private bondingCurve;
        
    constructor(address _bondingCurve) {
        bondingCurve = _bondingCurve;
    }

    function calculateBaseRate(address _tokUsdCl, uint8 _tokUsdDec) private view returns (uint256) {
        (,int256 tokUsd,,,) = Chainlink(_tokUsdCl).latestRoundData();
        (,int256 eurUsd,,,) = Chainlink(EUR_USD_CL).latestRoundData();
        return FIXED_POINT * uint256(tokUsd) / uint256(eurUsd) / 10 ** (_tokUsdDec - EUR_USD_CL_DEC);
    }

    function calculateDiscountRate() private view returns (uint256) {
        BondingCurve curve = BondingCurve(bondingCurve);
        return curve.FIXED_POINT() / curve.getDiscount();
    }

    function calculate(address _tokUsdCl, uint8 _tokUsdDec) external view returns (uint256 rate) {
        BondingCurve curve = BondingCurve(bondingCurve);
        return calculateBaseRate(_tokUsdCl, _tokUsdDec) * curve.FIXED_POINT() / curve.getDiscount();
    }
}