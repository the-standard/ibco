// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.14;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "contracts/test_utils/ERC20.sol";

contract WETHMock is MintableERC20 {

    constructor(
    ) MintableERC20("Wrapped Ether", "WETH", 18) {
    }

    function deposit() public payable {
        mint(msg.sender, msg.value);
    }
}
