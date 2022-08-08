// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "contracts/interfaces/IChainlink.sol";

contract Chainlink is IChainlink {
    int256 private immutable price;

    constructor(int256 _price) {
        price = _price;
    }

    function latestRoundData()
    external
    view
    returns (
        uint80,
        int256 answer,
        uint256,
        uint256,
        uint80
    )
    {
        return (0, price, 0, 0, 0);
    }
}
