//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/BondingCurve.sol";
import "contracts/interfaces/Chainlink.sol";

contract SEuroCalculator {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;

    address public immutable EUR_USD_CL;
    uint8 public immutable EUR_USD_CL_DEC;

    BondingCurve private bondingCurve;

    constructor(address _bondingCurve, address _eurUsdCl, uint8 _eurUsdDec) {
        bondingCurve = BondingCurve(_bondingCurve);
        EUR_USD_CL = _eurUsdCl;
        EUR_USD_CL_DEC = _eurUsdDec;
    }

    function calculateBaseRate(address _tokUsdCl, uint8 _tokUsdDec) private view returns (uint256) {
        (,int256 tokUsd,,,) = Chainlink(_tokUsdCl).latestRoundData();
        (,int256 eurUsd,,,) = Chainlink(EUR_USD_CL).latestRoundData();
        return FIXED_POINT * uint256(tokUsd) / uint256(eurUsd) / 10 ** (_tokUsdDec - EUR_USD_CL_DEC);
    }

    function calculate(uint256 _amount, address _tokUsdCl, uint8 _tokUsdDec) external returns (uint256) {
        uint256 euros = calculateBaseRate(_tokUsdCl, _tokUsdDec) * _amount / FIXED_POINT;
        return bondingCurve.calculatePrice(euros);
    }

    function readOnlyCalculate(uint256 _amount, address _tokUsdCl, uint8 _tokUsdDec) external view returns (uint256) {
        uint256 euros = calculateBaseRate(_tokUsdCl, _tokUsdDec) * _amount / FIXED_POINT;
        return bondingCurve.readOnlyCalculatePrice(euros);
    }
}
