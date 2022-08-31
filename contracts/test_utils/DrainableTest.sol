// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/Drainable.sol";

contract DrainableTest is Drainable {
    receive() external payable {}
}