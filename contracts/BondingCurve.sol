//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract BondingCurve {
    uint8 public constant MULTIPLIER = 5;
    address private seuro;
        
    constructor(address _seuro) {
        seuro = _seuro;
    }

    function getDiscount() public pure returns (uint256) {
        return 80 * 10 ** (MULTIPLIER - 2);
    }
}
