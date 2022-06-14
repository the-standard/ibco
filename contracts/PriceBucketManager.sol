// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract PriceBucketManager {
    uint256 public bucketSize;
    uint256[] public priceBuckets;

    constructor(
        uint256 _bucketSize,
        uint256[] memory _priceBuckets
    ) {
        bucketSize = _bucketSize;
        priceBuckets = _priceBuckets;
    }

    function getPriceBuckets() external view returns (uint256[] memory) {
        return priceBuckets;
    }
}
