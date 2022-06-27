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

	uint256 immutable one_billion = 10 ** 9;
	uint256 immutable decimals = 10 ** 18;
	uint256 public immutable TST_MAX_AMOUNT; // 1B tokens

	// Make the math simpler whilst TST < 1.00 EUR, store the inverted token price:
	// (price of one TST in EUR)^-1
	uint256 public tokenPrice;
	// Enabled when the price is less than 1
	bool public inversed;

	// The amount of TST available to get as bond reward
	uint256 public bondRewardPoolSupply;

	// The operator address
	address public operatorAddress;

	bytes32 public constant TST_TOKEN_GATEWAY = keccak256("TST_TOKEN_GATEWAY");

	constructor(address _standardToken, address _seuroToken) {
		_setupRole(TST_TOKEN_GATEWAY, msg.sender);
		TST_ADDRESS = _standardToken;
		SEUR_ADDRESS = _seuroToken;
		inversed = true;
		tokenPrice = 20; // 0.05 EUR
		TST_MAX_AMOUNT = one_billion * decimals;
		bondRewardPoolSupply = TST_MAX_AMOUNT / 2; // half the total supply is available as bond reward
	}

	modifier onlyGatewayOwner {
		require(hasRole(TST_TOKEN_GATEWAY, msg.sender), "invalid-user");
		_;
	}

	modifier onlyStorageOwner {
		require(msg.sender == operatorAddress, "err-not-storage-caller");
		_;
	}

	function setUnitPrice(uint256 _newPrice, bool _inversed) public onlyGatewayOwner {
		tokenPrice = _newPrice;
		inversed = _inversed;
	}

	function getStandardTokenPrice() public view returns (uint256, bool) {
		return (tokenPrice, inversed);
	}

	function getRewardSupply() public view returns (uint256) {
		return bondRewardPoolSupply;
	}

	function setOperatorAddress(address _newAddress) public onlyGatewayOwner {
		require(_newAddress != address(0), "err-zero-address");
		operatorAddress = _newAddress;
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
