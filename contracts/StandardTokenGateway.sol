//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

// StandardTokenGateway holds TSTs and acts as a standard token data feed with:
// - price per token in EUR;
// - amount of obtainable tokens as bonding rewards left
contract StandardTokenGateway is AccessControl {
	// Deployed TST contract on mainnet with a maximum supply of 1 billion tokens
	address public constant TST_ADDRESS = 0xa0b93B9e90aB887E53F9FB8728c009746e989B53;

	// Address to the contract with a maximum supply of 1 billion tokens
	address public immutable TOKEN_ADDRESS;

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

	// True if the contract is connected to mainnet TST token contract.
	// Set to false for testing purposes.
	bool immutable isProduction;

	// The amount of TST tokens that are to be paid out in the future.
	uint256 public pendingPayout;

	// The amount of TST available to get as bond reward
	uint256 public bondRewardPoolSupply;

	// The storage address
	address public storageAddress;

	bytes32 public constant TST_TOKEN_GATEWAY = keccak256("TST_TOKEN_GATEWAY");

	constructor(address _tokenAddress, address _seuroToken) {
		_setupRole(TST_TOKEN_GATEWAY, msg.sender);
		TOKEN_ADDRESS = _tokenAddress;
		SEUR_ADDRESS = _seuroToken;
		inversed = true;
		isProduction = TOKEN_ADDRESS == TST_ADDRESS;
		tokenPrice = 20; // 0.05 EUR
		TST_MAX_AMOUNT = one_billion * decimals;
		bondRewardPoolSupply = TST_MAX_AMOUNT / 2; // half the total supply is available as bond reward
	}

	modifier onlyGatewayOwner {
		require(hasRole(TST_TOKEN_GATEWAY, msg.sender), "invalid-user");
		_;
	}

	modifier onlyStorageOwner {
		require(msg.sender == storageAddress, "err-not-storage-caller");
		_;
	}


	function setUnitPrice(uint256 _newPrice, bool _inversed) public onlyGatewayOwner {
		tokenPrice = _newPrice;
		inversed = _inversed;
	}

	function getContractBalance() public view returns (uint256) {
		address localAddress = address(this);
		IERC20 token = IERC20(TOKEN_ADDRESS);
		return token.balanceOf(localAddress);
	}

	modifier enoughBalance(uint256 _toSend) {
		require(getContractBalance() > _toSend, "err-insufficient-tokens");
		_;
	}

	function getStandardTokenPrice() public view returns (uint256, bool) {
		return (tokenPrice, inversed);
	}

	function getRewardSupply() public view returns (uint256) {
		return bondRewardPoolSupply;
	}

	function setStorageAddress(address _newAddress) public onlyGatewayOwner {
		require(_newAddress != address(0), "err-zero-address");
		storageAddress = _newAddress;
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
