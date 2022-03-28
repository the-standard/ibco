//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BondingCurve {
    address private seuro;
        
    constructor(address _seuro) {
        seuro = _seuro;
    }

    function getDiscount() public pure returns (uint256) {
        return 80;
    }
}
