//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

// StandardTokenGateway acts as a standard token data feed with the current:
// - price per token in EUR;
// - amount of obtainable tokens as bonding rewards left
contract StandardTokenGateway is AccessControl {
	// Address to the TST contract with a maximum supply of 1 billion tokens
	address public immutable TST_ADDRESS;

	// Address to the sEURO contract with a varying supply
	address public immutable SEUR_ADDRESS;

	// Total supply TST
	uint256 public immutable TST_MAX_AMOUNT = 1_000_000_000;

	// The price of one TST in EUR
	int128 public tokenPrice;

	// The amount of TST available to get as bond reward
	uint256 public bondRewardPoolSupply;

	// The contract which owns the bonds
	address public bondStorageAddress;

	bytes32 public constant TST_TOKEN_GATEWAY = keccak256("TST_TOKEN_GATEWAY");

	constructor(address _standardToken, address _seuroToken) {
		_setupRole(TST_TOKEN_GATEWAY, msg.sender);
		TST_ADDRESS = _standardToken;
		SEUR_ADDRESS = _seuroToken;
		tokenPrice = ABDKMath64x64.divu(1, 20); // 0.05 EUR from latest liquidity bootstrapping
		bondRewardPoolSupply = 500_000_000; // 500M: half the total supply is available as bond reward
	}

	modifier onlyGatewayOwner {
		require(hasRole(TST_TOKEN_GATEWAY, msg.sender), "invalid-user");
		_;
	}

	modifier onlyStorageOwner {
		require(msg.sender == bondStorageAddress, "inv-contract-sender");
		_;
	}

	function setUnitPrice(int128 _newPrice) public onlyGatewayOwner {
		tokenPrice = _newPrice;
	}

	function getStandardTokenPrice() public view returns (int128) {
		return tokenPrice;
	}

	function getRewardSupply() public view returns (uint256) {
		return bondRewardPoolSupply;
	}

	function setNewBondStorage(address _newAddress) public onlyGatewayOwner {
		require(_newAddress != address(0), "inv-contract-address");
		bondStorageAddress = _newAddress;
	}

	function decreaseRewardSupply(uint256 _amount) public onlyStorageOwner {
		require(bondRewardPoolSupply - _amount > 0, "dec-supply-uf");
		bondRewardPoolSupply -= _amount;
	}

	function increaseRewardSupply(uint256 _amount) public onlyStorageOwner {
		require(bondRewardPoolSupply + _amount < TST_MAX_AMOUNT, "inc-supply-of");
		bondRewardPoolSupply += _amount;
	}
}
