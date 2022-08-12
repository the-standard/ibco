//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "contracts/interfaces/IChainlink.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// StandardTokenGateway holds TSTs and acts as a standard token data feed with:
// - price per token in EUR;
// - amount of obtainable tokens as bonding rewards left
contract StandardTokenGateway is AccessControl {
	// Deployed TST contract on mainnet with a maximum supply of 1 billion tokens
	address public constant TST_ADDRESS = 0xa0b93B9e90aB887E53F9FB8728c009746e989B53;

	// Address to the contract with a maximum supply of 1 billion tokens
	address public immutable TOKEN_ADDRESS;

	// Reward token
	IERC20 private immutable TOKEN;

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

	// The amount of TST tokens that are to be paid out in the future.
	uint256 public pendingPayout;

	// The amount of TST available to get as bond reward
	uint256 public bondRewardPoolSupply;

	// By default enabled.
	// False when token transfers are disabled.
	bool private isActive;

	// The storage address
	address public storageAddress;

	bytes32 public constant TST_TOKEN_GATEWAY = keccak256("TST_TOKEN_GATEWAY");

	constructor(address _tokenAddress, address _seuroToken) {
		_setupRole(TST_TOKEN_GATEWAY, msg.sender);
		TOKEN_ADDRESS = _tokenAddress;
		TOKEN = IERC20(TOKEN_ADDRESS);
		SEUR_ADDRESS = _seuroToken;
		inversed = true;
		tokenPrice = 20; // 0.05 EUR
		TST_MAX_AMOUNT = one_billion * decimals;
		bondRewardPoolSupply = 0;
		isActive = true;
	}

	modifier onlyGatewayOwner {
		require(hasRole(TST_TOKEN_GATEWAY, msg.sender), "invalid-user");
		_;
	}

	modifier onlyStorageOwner {
		require(msg.sender == storageAddress, "err-not-storage-caller");
		_;
	}

	modifier isActivated {
		require(isActive == true, "err-in-maintenance");
		_;
	}

	function deactivateSystem() public onlyGatewayOwner {
		isActive = false;
	}

	function activateSystem() public onlyGatewayOwner {
		isActive = true;
	}

	function setUnitPrice(uint256 _newPrice, bool _inversed) public onlyGatewayOwner {
		tokenPrice = _newPrice;
		inversed = _inversed;
	}

	function updateRewardSupply() public {
		bondRewardPoolSupply = TOKEN.balanceOf(address(this));
	}

	modifier enoughBalance(uint256 _toSend) {
		uint256 currBalance = TOKEN.balanceOf(address(this));
		require(currBalance > _toSend, "err-insufficient-tokens");
		_;
	}

	function getSeuroStandardTokenPrice() public view returns (uint256, bool) {
		return (tokenPrice, inversed);
	}

	function getRewardSupply() public view returns (uint256) {
		return bondRewardPoolSupply;
	}

	function setStorageAddress(address _newAddress) public onlyGatewayOwner {
		require(_newAddress != address(0), "err-zero-address");
		storageAddress = _newAddress;
	}

	function decreaseRewardSupply(uint256 _amount) public onlyStorageOwner enoughBalance(_amount) {
		require(bondRewardPoolSupply - _amount > 0, "dec-supply-uf");
		bondRewardPoolSupply -= _amount;
	}

	function transferReward(address _toUser, uint256 _amount) external onlyStorageOwner isActivated enoughBalance(_amount) {
		TOKEN.transfer(_toUser, _amount);
	}
}
