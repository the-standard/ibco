// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "contracts/interfaces/IChainlink.sol";

contract PriceConverter {
    IChainlink private immutable chainlinkEurUsd;
    IChainlink private immutable chainlinkEthUsd;

    constructor(address _chainlinkEurUsd, address _chainlinkEthUsd) {
        chainlinkEurUsd = IChainlink(_chainlinkEurUsd);
        chainlinkEthUsd = IChainlink(_chainlinkEthUsd);
    }

    function eurosToEth(uint256 _amount) external view returns (uint256) {
        (,int256 eurUsdRate,,,) = chainlinkEurUsd.latestRoundData();
        (,int256 usdEthRate,,,) = chainlinkEthUsd.latestRoundData();
        return _amount * uint256(eurUsdRate) / uint256(usdEthRate);
    }
}
