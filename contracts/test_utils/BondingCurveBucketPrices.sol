//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/BondingCurve.sol";

contract BondingCurveBucketPrices is BondingCurve {
    constructor(
        address _seuro,
        uint256 _initialPrice,
        uint256 _maxSupply,
        uint256 _bucketSize
    ) BondingCurve(_seuro, _initialPrice, _maxSupply, _bucketSize) {
        
    }

    function getPriceOfBucket(uint32 _bucketIndex) external returns (uint256) {
        return getBucketPrice(_bucketIndex);
    }
}
