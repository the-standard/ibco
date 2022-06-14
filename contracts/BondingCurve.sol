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

    uint32 private bucket;
    uint256 public bucketPrice;

    constructor(address _seuro, uint256 _initialPrice, uint256 _maxSupply, uint256 _bucketSize) {
        seuro = _seuro;
        initialPrice = _initialPrice;
        maxSupply = _maxSupply;
        k = FINAL_PRICE - initialPrice;
        j = ABDKMath64x64.divu(J_NUMERATOR, J_DENOMINATOR);


        bucketSize = _bucketSize;
        setBucketCache();
    }

    function pricePerEuro() public view returns (uint256) {
        uint256 supply = SEuro(seuro).totalSupply();
        if (supply < INITIAL_SUPPLY) {
            return initialPrice;
        }
        if (supply >= maxSupply) {
            return FINAL_PRICE;
        }
        int128 supplyRatio = ABDKMath64x64.divu(supply, maxSupply);
        int128 log2SupplyRatio = ABDKMath64x64.log_2(supplyRatio);
        int128 jlog2SupplyRatio = ABDKMath64x64.mul(j, log2SupplyRatio);
        int128 baseCurve = ABDKMath64x64.exp_2(jlog2SupplyRatio);
        uint256 curve = ABDKMath64x64.mulu(baseCurve, k);
        return curve + initialPrice;
    }

    function setBucketCache() private {
        bucket = 0;
        bucketPrice = getBucketPrice(bucket);
    }

    function getBucketPrice(uint32 bucketIndex) private view returns (uint256) {
        uint256 medianBucketToken = bucketIndex * bucketSize + bucketSize / 2;
        int128 supplyRatio = ABDKMath64x64.divu(medianBucketToken, maxSupply);
        int128 log2SupplyRatio = ABDKMath64x64.log_2(supplyRatio);
        int128 jlog2SupplyRatio = ABDKMath64x64.mul(j, log2SupplyRatio);
        int128 baseCurve = ABDKMath64x64.exp_2(jlog2SupplyRatio);
        uint256 curve = ABDKMath64x64.mulu(baseCurve, k);
        return curve + initialPrice;
    }

    function seuroValue(uint256 _euroAmount) external returns (uint256) {
        return convertEuroToSeuro(_euroAmount, bucketPrice);
        // if supply is beyond current bucket
        //   move bucket index
        //   calculate new cached bucket price
        // in loop (while remaining > 0):
        //   if remaining euros is more than equivalent seuro in remaining in bucket
        //     subtract equivalent of seuro in euros from remaining
        //     add equivalent seuro to "seuroTotal"
        //     increment current bucket (not the field)
        //   else
        //     add equivalent seuro to "seuroTotal" for remaining euros
    }

    function convertEuroToSeuro(uint256 _amount, uint256 _rate) private view returns (uint256) {
        return _amount * 10 ** 18 / _rate;
    }
}
