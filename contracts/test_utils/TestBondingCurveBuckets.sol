// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.15;

import "contracts/Stage1/BondingCurve.sol";

contract TestBondingCurve is BondingCurve {
    constructor(
        uint256 _initialPrice,
        uint256 _maxSupply,
        uint256 _bucketSize
    ) BondingCurve(_initialPrice, _maxSupply, _bucketSize) {
    }

    function getPriceOfBucket(uint32 _bucketIndex) external returns (uint256) {
        return getBucketPrice(_bucketIndex);
    }
}
