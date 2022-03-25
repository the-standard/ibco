// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETH is ERC20 {
    
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
}
