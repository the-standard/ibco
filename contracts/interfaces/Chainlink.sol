//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface Chainlink {
    function latestRoundData() external view
        returns (
            uint80,
            int256 answer,
            uint256,
            uint256,
            uint80
        );
}
