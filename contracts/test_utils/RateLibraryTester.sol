// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.15;

import "contracts/Rates.sol";

contract RatesLibraryTester {

    function testConvertDefault(uint256 _amount, uint256 _rate, uint8 _decimals) public pure returns (uint256) {
        return Rates.convertDefault(_amount, _rate, _decimals);
    }

    function testConvertInverse(uint256 _amount, uint256 _rate, uint8 _decimals) public pure returns (uint256) {
        return Rates.convertInverse(_amount, _rate, _decimals);
    }
}
