//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1 ether;
    address private seuro;
        
    constructor(address _seuro) {
        seuro = _seuro;
    }

    function getDiscount() public pure returns (uint256) {
        return 80 * FIXED_POINT / 100;
    }
}
