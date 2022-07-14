//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IBondStorage {
	function startBond(address _user, uint256 _principal, uint256 _rate, uint256 _maturity, uint256 _tokenId, uint128 _liquidity, uint256 _amountOther) external;
	function refreshBondStatus(address _user) external;
	function claimReward() external;
}

interface IBondingEvent {
	function bond(address _user, uint256 _amountSeuro, uint256 _amountOther, address _otherAddress, uint256 _weeks, uint256 _rate) external;
}

