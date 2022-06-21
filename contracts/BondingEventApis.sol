//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/BondStorage.sol";

contract BondingEventApis is BondStorage {
	// bond storage contract
	address public bondStorage;

	constructor(address _bondStorage) {
		bondStorage = _bondStorage;
	}

	function getAmountBonds(address _user) public view returns (uint256) {
		return BondStorage.getActiveBonds(_user);
	}

	function getUserBonds(address _user) public view override returns (Bond[] memory) {
		return BondStorage.getUserBonds(_user);
	}

	function getUserBondAt(address _user, uint128 index) public view returns (Bond memory) {
		require(index <= getUserBonds(_user).length - 1 && index >= 0, "invalid-bond-index");
		return BondStorage.getBondAt(_user, index);
	}

	function getUserProfit(address _user) public view returns (uint256) {
		return BondStorage.getProfit(_user);
	}

	function updateBondStatus(address _user) public {
		BondStorage.refreshBondStatus(_user);
	}
}
