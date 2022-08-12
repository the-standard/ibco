// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

library SimpleInterest {
    function FromSeuroToStandard(uint256 _amountSeuro, uint256 _exchangeRate, bool _inverted) public view returns (uint256) {
        return _inverted ? _amountSeuro * _exchangeRate : _amountSeuro / _exchangeRate;
    }
}


