//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/BondingCurve.sol";
import "contracts/interfaces/Chainlink.sol";

contract SEuroCalculator {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;
    address public constant EUR_USD_CL = 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;
    uint8 public constant EUR_USD_CL_DEC = 8;

    BondingCurve private bondingCurve;

    constructor(address _bondingCurve) {
        bondingCurve = BondingCurve(_bondingCurve);
    }

    function calculateBaseRate(address _tokUsdCl, uint8 _tokUsdDec) private view returns (uint256) {
        (,int256 tokUsd,,,) = Chainlink(_tokUsdCl).latestRoundData();
        (,int256 eurUsd,,,) = Chainlink(EUR_USD_CL).latestRoundData();
        return FIXED_POINT * uint256(tokUsd) / uint256(eurUsd) / 10 ** (_tokUsdDec - EUR_USD_CL_DEC);
    }

    function calculate(uint256 _amount, address _tokUsdCl, uint8 _tokUsdDec) external returns (uint256 rate) {
        uint256 euros = calculateBaseRate(_tokUsdCl, _tokUsdDec) * _amount / FIXED_POINT;
        rate = bondingCurve.updateBucketAndCalculatePrice(euros);
    }
}
