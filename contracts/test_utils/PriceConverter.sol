//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/interfaces/Chainlink.sol";

contract PriceConverter {
    Chainlink private constant CHAINLINK_EUR_USD = Chainlink(0xb49f677943BC038e9857d61E7d053CaA2C1734C1);
    Chainlink private constant CHAINLINK_USD_ETH = Chainlink(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);

    function eurosToEth(uint256 _amount) external view returns (uint256) {
        (,int256 eurUsdRate,,,) = CHAINLINK_EUR_USD.latestRoundData();
        (,int256 usdEthRate,,,) = CHAINLINK_USD_ETH.latestRoundData();
        return _amount * uint256(eurUsdRate) / uint256(usdEthRate);
    }
}
