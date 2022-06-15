//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;
    uint256 private constant FINAL_PRICE = 1_000_000_000_000_000_000;
    uint8 private constant INITIAL_SUPPLY = 1;
    uint8 private constant J_NUMERATOR = 1;
    uint8 private constant J_DENOMINATOR = 5;

    uint256 private immutable initialPrice;
    uint256 private immutable maxSupply;
    uint256 private immutable k;
    int128 private immutable j;
    address private immutable seuro;
    uint256 private immutable bucketSize;
    uint32 private immutable finalBucketIndex;

    uint32 private currentBucketIndex;
    uint256 public currentBucketPrice;

    constructor(address _seuro, uint256 _initialPrice, uint256 _maxSupply, uint256 _bucketSize) {
        seuro = _seuro;
        initialPrice = _initialPrice;
        maxSupply = _maxSupply;
        k = FINAL_PRICE - initialPrice;
        j = ABDKMath64x64.divu(J_NUMERATOR, J_DENOMINATOR);

        bucketSize = _bucketSize;
        finalBucketIndex = uint32(_maxSupply / _bucketSize);
        updateCurrentBucket();
    }

    function getBucketPrice(uint32 _bucketIndex) private view returns (uint256) {
        if (_bucketIndex >= finalBucketIndex) return FINAL_PRICE;
        uint256 medianBucketToken = getMedianToken(_bucketIndex);
        int128 supplyRatio = ABDKMath64x64.divu(medianBucketToken, maxSupply);
        int128 log2SupplyRatio = ABDKMath64x64.log_2(supplyRatio);
        int128 jlog2SupplyRatio = ABDKMath64x64.mul(j, log2SupplyRatio);
        int128 baseCurve = ABDKMath64x64.exp_2(jlog2SupplyRatio);
        uint256 curve = ABDKMath64x64.mulu(baseCurve, k);
        return curve + initialPrice;
    }

    function getMedianToken(uint32 _bucketIndex) private view returns (uint256) {
        return _bucketIndex * bucketSize + bucketSize / 2;
    }

    function seuroValue(uint256 _euroAmount) external returns (uint256) {
        // TODO make dependent contracts implement this function
        // add the "next price" to a cache mapping, look for this when updating based on supply, then delete from mapping afterwards
        updateCurrentBucket();
        uint256 sEuroTotal = 0;
        uint256 remainingEuros = _euroAmount;
        uint32 bucketIndex = currentBucketIndex;
        uint256 bucketPrice = currentBucketPrice;
        while (remainingEuros > 0) {
            uint256 remainingInSeuro = convertEuroToSeuro(remainingEuros, bucketPrice);
            uint256 remainingCapacityInBucket = remainingCapacityInBucket(bucketIndex);
            if (remainingInSeuro > remainingCapacityInBucket) {
                sEuroTotal += remainingCapacityInBucket;
                remainingEuros -= convertSeuroToEuro(remainingCapacityInBucket, bucketPrice);
                bucketIndex++;
                bucketPrice = getBucketPrice(bucketIndex);
            } else {
                sEuroTotal += remainingInSeuro;
                remainingEuros = 0;
            }
        }
        return sEuroTotal;
    }

    function updateCurrentBucket() private {
        uint256 supply = SEuro(seuro).totalSupply();
        currentBucketIndex = uint32(supply / bucketSize);
        currentBucketPrice = getBucketPrice(currentBucketIndex);
    }

    function remainingCapacityInBucket(uint32 _bucketIndex) private view returns(uint256) {
        uint256 bucketCapacity = (_bucketIndex + 1) * bucketSize;
        uint256 supply = SEuro(seuro).totalSupply();
        uint256 diff = bucketCapacity - supply;
        return diff > bucketSize ? bucketSize : diff;
    }

    function convertEuroToSeuro(uint256 _amount, uint256 _rate) private pure returns (uint256) {
        return _amount * 10 ** 18 / _rate;
    }

    function convertSeuroToEuro(uint256 _amount, uint256 _rate) private pure returns (uint256) {
        return _amount * _rate / 10 ** 18;
    }
}
