//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/SEuro.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingCurve {
    uint256 public constant FIXED_POINT = 1_000_000_000_000_000_000;
    uint256 private constant FINAL_PRICE = 1_000_000_000_000_000_000;
    uint8 private constant l = 1;
    uint8 private constant jNumerator = 1;
    uint8 private constant jDenominator = 5;

    uint256 private immutable i;
    uint256 private immutable m;
    uint256 private immutable k;
    int128 private immutable j;
    address private immutable seuro;

    constructor(address _seuro, uint256 _initialPrice, uint256 _maxSupply) {
        seuro = _seuro;
        i = _initialPrice;
        m = _maxSupply;
        k = FINAL_PRICE - i;
        j = ABDKMath64x64.divu(jNumerator, jDenominator);
    }
    
    function pricePerEuro() public view returns (uint256) {
        uint256 x = SEuro(seuro).totalSupply();
        if (x == 0) {
            return i;
        }
        uint256 xMinusL = x - l;
        int128 xMinusLOverM = ABDKMath64x64.divu(xMinusL, m);
        int128 log2XMinusLOverM = ABDKMath64x64.log_2(xMinusLOverM);
        int128 jLog2XMinusLOverM = ABDKMath64x64.mul(j, log2XMinusLOverM);
        int128 exp2JLog2XMinusLOverM = ABDKMath64x64.exp_2(jLog2XMinusLOverM);
        uint256 kExp2JLog2XMinusLOverM = ABDKMath64x64.mulu(exp2JLog2XMinusLOverM, k);
        return kExp2JLog2XMinusLOverM + i;
    }
}
