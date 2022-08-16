// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "contracts/SimpleRate.sol";

contract RatesLibraryTester {

    function testConvertDefault(uint256 _amount, uint256 _rate, uint8 _decimals) public pure returns (uint256) {
        return SimpleRate.convertDefault(_amount, _rate, _decimals);
    }

    function testConvertInverse(uint256 _amount, uint256 _rate, uint8 _decimals) public pure returns (uint256) {
        return SimpleRate.convertInverse(_amount, _rate, _decimals);
    }
}
