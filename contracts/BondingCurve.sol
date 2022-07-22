//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "hardhat/console.sol";

contract BondingCurve is AccessControl {
    struct Bucket {
        uint32 index;
        uint256 price;
    }

    uint256 private constant FINAL_PRICE = 1_000_000_000_000_000_000;
    uint8 private constant J_NUMERATOR = 1;
    uint8 private constant J_DENOMINATOR = 5;
	bytes32 public constant DEFAULT_ADMIN = keccak256("DEFAULT_ADMIN");
	bytes32 public constant UPDATER = keccak256("UPDATER");
	bytes32 public constant CALCULATOR = keccak256("CALCULATOR");

    uint256 private immutable initialPrice;
    uint256 private immutable maxSupply;
    uint256 private immutable k;
    int128 private immutable j;
    SEuro private immutable seuro;
    uint256 private immutable bucketSize;
    uint32 private immutable finalBucketIndex;

    Bucket public currentBucket;
    mapping(uint32 => uint256) private bucketPricesCache;
    uint256 private ibcoTotalSupply;

    constructor(address _seuro, uint256 _initialPrice, uint256 _maxSupply, uint256 _bucketSize) {
		_grantRole(DEFAULT_ADMIN, msg.sender);
        _setRoleAdmin(UPDATER, DEFAULT_ADMIN);
        _setRoleAdmin(CALCULATOR, DEFAULT_ADMIN);
		grantRole(UPDATER, msg.sender);
		grantRole(CALCULATOR, msg.sender);

        seuro = SEuro(_seuro);
        initialPrice = _initialPrice;
        maxSupply = _maxSupply;
        k = FINAL_PRICE - initialPrice;
        j = ABDKMath64x64.divu(J_NUMERATOR, J_DENOMINATOR);

        bucketSize = _bucketSize;
        finalBucketIndex = uint32(_maxSupply / _bucketSize);
        updateCurrentBucket(ibcoTotalSupply);
    }

    modifier onlyUpdater {
		require(hasRole(UPDATER, msg.sender), "invalid-user");
        _;
    }

    modifier onlyCalculator {
		require(hasRole(CALCULATOR, msg.sender), "invalid-user");
        _;
    }

    function setUpdater(address _updater) external {
        grantRole(UPDATER, _updater);
    }

    function setCalculator(address _calculator) external {
        grantRole(CALCULATOR, _calculator);
    }

    function readOnlyCalculatePrice(uint256 _euroAmount) external view returns (uint256) {
        // fetches the price of euros based on the *current* discount price, therefore not completely accurate
        return convertEuroToSeuro(_euroAmount, currentBucket.price);
    }

    function calculatePrice(uint256 _euroAmount) external onlyCalculator returns (uint256) {
        uint256 _sEuroTotal = 0;
        uint256 remainingEuros = _euroAmount;
        uint32 bucketIndex = currentBucket.index;
        uint256 bucketPrice = currentBucket.price;
        while (remainingEuros > 0) {
            uint256 remainingInSeuro = convertEuroToSeuro(remainingEuros, bucketPrice);
            uint256 remainingCapacityInBucket = getRemainingCapacityInBucket(bucketIndex);
            if (remainingInSeuro > remainingCapacityInBucket) {
                _sEuroTotal += remainingCapacityInBucket;
                remainingEuros -= convertSeuroToEuro(remainingCapacityInBucket, bucketPrice);
                bucketIndex++;
                bucketPrice = getBucketPrice(bucketIndex);
                continue;
            }
            _sEuroTotal += remainingInSeuro;
            remainingEuros = 0;
        }
        return _sEuroTotal;
    }

    function updateCurrentBucket(uint256 _minted) public onlyUpdater {
        ibcoTotalSupply += _minted;
        uint32 bucketIndex = uint32(ibcoTotalSupply / bucketSize);
        currentBucket = Bucket(bucketIndex, getBucketPrice(bucketIndex));
        delete bucketPricesCache[bucketIndex];
    }

    function getBucketPrice(uint32 _bucketIndex) internal returns (uint256 _price) {
        if (_bucketIndex >= finalBucketIndex) return FINAL_PRICE;
        uint256 cachedPrice = bucketPricesCache[_bucketIndex];
        if (cachedPrice > 0) return cachedPrice;
        uint256 medianBucketToken = getMedianToken(_bucketIndex);
        int128 supplyRatio = ABDKMath64x64.divu(medianBucketToken, maxSupply);
        int128 log2SupplyRatio = ABDKMath64x64.log_2(supplyRatio);
        int128 jlog2SupplyRatio = ABDKMath64x64.mul(j, log2SupplyRatio);
        int128 baseCurve = ABDKMath64x64.exp_2(jlog2SupplyRatio);
        uint256 curve = ABDKMath64x64.mulu(baseCurve, k);
        _price = curve + initialPrice;
        cacheBucketPrice(_bucketIndex, _price);
    }

    function convertEuroToSeuro(uint256 _amount, uint256 _rate) private pure returns (uint256) {
        return _amount * 10 ** 18 / _rate;
    }

    function getRemainingCapacityInBucket(uint32 _bucketIndex) private view returns(uint256) {
        uint256 bucketCapacity = (_bucketIndex + 1) * bucketSize;
        uint256 diff = bucketCapacity - ibcoTotalSupply;
        return diff > bucketSize ? bucketSize : diff;
    }

    function convertSeuroToEuro(uint256 _amount, uint256 _rate) private pure returns (uint256) {
        return _amount * _rate / 10 ** 18;
    }

    function getMedianToken(uint32 _bucketIndex) private view returns (uint256) {
        return _bucketIndex * bucketSize + bucketSize / 2;
    }

    function cacheBucketPrice(uint32 _bucketIndex, uint256 _bucketPrice) private {
        bucketPricesCache[_bucketIndex] = _bucketPrice;
    }
}
