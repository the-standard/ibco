// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

library SimpleRate {
    function convert(uint256 _amount, uint256 _exchangeRate, bool _inverted) public pure returns (uint256) {
        return _inverted ? _amount * _exchangeRate : _amount / _exchangeRate;
    }
}


