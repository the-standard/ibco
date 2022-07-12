//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "contracts/BondStorage.sol";
import "contracts/BondingEvent.sol";
import "contracts/StandardTokenGateway.sol";

contract OperatorStage2 is AccessControl {
	bytes32 public constant OPERATOR_STAGE_2 = keccak256("OPERATOR_STAGE_2");

	// BondStorage contract address
	address public storageAddress;
	BondStorage bondStorage;

	// BondingEvent contract
	address public eventAddress;
	BondingEvent bondingEvent;

	// StandardTokenGateway contract
	address public gatewayAddress;
	StandardTokenGateway tokenGateway;

	constructor() {
		_setupRole(OPERATOR_STAGE_2, msg.sender);
	}

	modifier onlyOperatorStage2 {
		require(hasRole(OPERATOR_STAGE_2, msg.sender), "err-invalid-sender");
		_;
	}

	function setStorage(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != storageAddress, "err-same-address");
		storageAddress = _newAddress;
		bondStorage = BondStorage(storageAddress);
	}

	function setBonding(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != eventAddress, "err-same-address");
		eventAddress = _newAddress;
		bondingEvent = BondingEvent(eventAddress);
	}

	function setGateway(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != gatewayAddress, "err-same-address");
		gatewayAddress = _newAddress;
		tokenGateway = StandardTokenGateway(gatewayAddress);
	}

	function newBond(
		address _user,
		uint256 _amountSeuro,
		uint256 _amountOther,
		address _otherAddress,
		uint256 _weeks,
		uint256 _rate
	) public onlyOperatorStage2 {
		bondingEvent.bond(_user, _amountSeuro, _amountOther, _otherAddress, _weeks, _rate);
	}

	function refreshBond(address _user) public {
		bondStorage.refreshBondStatus(_user);
	}

	function claim() public {
		(bool success, ) = storageAddress.delegatecall(abi.encodeWithSignature("claimReward()"));
		require(success == true, "err-claim-failed-505");
	}
}
