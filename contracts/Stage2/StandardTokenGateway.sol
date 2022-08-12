//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/interfaces/IChainlink.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// StandardTokenGateway holds TSTs and acts as a standard token data feed with:
// - price per token in EUR;
// - amount of obtainable tokens as bonding rewards left
contract StandardTokenGateway is AccessControl {

    // permitted role to update dependencies and prices
	bytes32 public constant TST_TOKEN_GATEWAY = keccak256("TST_TOKEN_GATEWAY");
	uint256 public constant TST_MAX_AMOUNT = 10 ** 9 * 1 ether; // 1B tokens
	
    // Reward token
	IERC20 private immutable TOKEN;
    
	// Make the math simpler whilst TST < 1.00 EUR, store the inverted token price:
	// (price of one TST in EUR)^-1
	uint256 public tokenPrice = 20;
	// Enabled when the price is less than 1
	bool public inversed = true;

	// The amount of TST tokens that are to be paid out in the future.
	uint256 public pendingPayout;

	// The amount of TST available to get as bond reward
	uint256 public bondRewardPoolSupply;

	// The storage address
	address public storageAddress;

	// By default enabled.
	// False when token transfers are disabled.
	bool public isActive = true;

	constructor(address _tokenAddress) {
		_setupRole(TST_TOKEN_GATEWAY, msg.sender);
		TOKEN = IERC20(_tokenAddress);
	}

	modifier onlyGatewayOwner { require(hasRole(TST_TOKEN_GATEWAY, msg.sender), "invalid-user"); _; }

	modifier onlyStorageOwner { require(msg.sender == storageAddress, "err-not-storage-caller"); _; }

	modifier isActivated { require(isActive == true, "err-in-maintenance"); _; }

	function deactivateSystem() public onlyGatewayOwner { isActive = false; }

	function activateSystem() public onlyGatewayOwner { isActive = true; }

	function setUnitPrice(uint256 _newPrice, bool _inversed) public onlyGatewayOwner {
		tokenPrice = _newPrice;
		inversed = _inversed;
	}

	function updateRewardSupply() public { bondRewardPoolSupply = TOKEN.balanceOf(address(this)); }

	modifier enoughBalance(uint256 _toSend) {
		require(TOKEN.balanceOf(address(this)) > _toSend, "err-insufficient-tokens"); _;
	}

	function getSeuroStandardTokenPrice() public view returns (uint256, bool) { return (tokenPrice, inversed); }

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
